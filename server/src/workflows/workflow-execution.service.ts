import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { assertSafeOutboundUrl } from "../common/url-validation.utils";
import { WORKFLOW_RESULT_STATUS } from "../constants/domain-statuses";
import { WORKFLOW_STEP_TYPES } from "../constants/domain-types";
import { WorkflowExecutionLog } from "../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../database/entities/workflow-rule.entity";
import { EmailArchiveService } from "../emails/email-archive.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_EVALUATE_WORKFLOW_CONDITION } from "../llm/llm-operations";
import { MCPClientManagerService } from "../mcp/mcp-client-manager.service";
import {
  WorkflowAction,
  WorkflowActionMCPTool,
  WorkflowActionReply,
  WorkflowActionResult,
  WorkflowActionWebhook,
  WorkflowContext,
  WorkflowExecutionResult,
  WorkflowExecutionStatus,
} from "./types/workflow.types";
import { WorkflowVariableResolver } from "./workflow-variable-resolver";

const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_NL_BODY_CHARS = 2000;

/**
 * Executes a matched workflow rule: resolves variables, invokes actions,
 * records the execution log.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);

  constructor(
    @InjectRepository(WorkflowExecutionLog)
    private readonly logsRepo: Repository<WorkflowExecutionLog>,
    private readonly variableResolver: WorkflowVariableResolver,
    private readonly mcpClientManager: MCPClientManagerService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly emailArchiveService: EmailArchiveService,
    private readonly llmCoreService: LLMCoreService,
  ) {}

  /**
   * Execute a workflow rule against an email context.
   * Returns a structured result with per-action outcomes.
   */
  async execute(
    rule: WorkflowRule,
    context: WorkflowContext,
  ): Promise<WorkflowExecutionResult> {
    this.logger.log(
      `Executing workflow "${rule.name}" (${rule.id}) for thread ${context.emailThreadId}`,
    );

    const log = this.logsRepo.create({
      workflowRuleId: rule.id,
      userId: context.userId,
      emailThreadId: context.emailThreadId,
      status: "running" as WorkflowExecutionStatus,
      actionResults: [],
      resolvedVariables: null,
    });
    await this.logsRepo.save(log);

    const actionResults: WorkflowActionResult[] = [];
    let resolvedVariables: Record<string, string> = {};

    for (const [i, action] of rule.actions.entries()) {
      const start = Date.now();
      try {
        const { output, resolved } = await this.executeAction(action, context);
        if (resolved) resolvedVariables = { ...resolvedVariables, ...resolved };
        actionResults.push({
          actionIndex: i,
          status: "success",
          output,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        this.logger.error(
          `Action ${i} (${action.type}) failed for workflow ${rule.id}: ${(err as Error).message}`,
        );
        actionResults.push({
          actionIndex: i,
          status: "failed",
          error: (err as Error).message,
          durationMs: Date.now() - start,
        });
        // Continue with remaining actions (partial_failure is acceptable)
      }
    }

    const allSucceeded = actionResults.every(
      (result) => result.status === WORKFLOW_RESULT_STATUS.SUCCESS,
    );
    const anySucceeded = actionResults.some(
      (result) => result.status === WORKFLOW_RESULT_STATUS.SUCCESS,
    );
    let status: WorkflowExecutionStatus = "failed";
    if (allSucceeded) {
      status = "success";
    } else if (anySucceeded) {
      status = "partial_failure";
    }

    // Persist completed log
    await this.logsRepo.update(log.id, {
      status,
      actionResults,
      resolvedVariables,
    });

    return {
      matched: true,
      ruleId: rule.id,
      ruleName: rule.name,
      status,
      actionResults,
      resolvedVariables,
    };
  }

  /**
   * Evaluate a rule's naturalLanguageCondition via LLM.
   * Returns true if the condition matches (or if there is no NL condition).
   */
  async evaluateNaturalLanguageCondition(
    rule: WorkflowRule,
    context: WorkflowContext,
  ): Promise<boolean> {
    const nlCondition = rule.condition.naturalLanguageCondition;
    if (!nlCondition) return true;

    const prompt = [
      "You are an email classifier. Determine whether the following email matches the condition.",
      "",
      `CONDITION: ${nlCondition}`,
      "",
      `FROM: ${context.from}`,
      `SUBJECT: ${context.subject}`,
      `SUMMARY: ${context.summary}`,
      `BODY (truncated): ${context.body.slice(0, MAX_NL_BODY_CHARS)}`,
      "",
      'Reply with a JSON object: {"matches": true} or {"matches": false}',
    ].join("\n");

    try {
      const response = await this.llmCoreService.generateText({
        prompt,
        operation: LLM_OP_EVALUATE_WORKFLOW_CONDITION,
        maxTokens: 64,
        jsonMode: true,
        userId: context.userId,
      });
      const parsed = JSON.parse(response);
      return Boolean(parsed?.matches);
    } catch (err) {
      this.logger.warn(
        `NL condition evaluation failed for rule ${rule.id}: ${(err as Error).message}. Defaulting to match.`,
      );
      // Default to match on LLM failure to avoid silently dropping workflows
      return true;
    }
  }

  // ── Private action executors ──────────────────────────────────────────────────

  private async executeAction(
    action: WorkflowAction,
    context: WorkflowContext,
  ): Promise<{ output: unknown; resolved?: Record<string, string> }> {
    switch (action.type) {
      case WORKFLOW_STEP_TYPES.REPLY:
        return this.executeReply(action, context);
      case WORKFLOW_STEP_TYPES.MCP_TOOL:
        return this.executeMCPTool(action, context);
      case WORKFLOW_STEP_TYPES.WEBHOOK:
        return this.executeWebhook(action, context);
      case WORKFLOW_STEP_TYPES.ARCHIVE:
        return this.executeArchive(context);
      default:
        throw new Error(
          `Unknown action type: ${(action as WorkflowAction).type}`,
        );
    }
  }

  /**
   * Archive the matched email's thread. Reuses the app's archive path so the
   * thread is unstarred, marked read, flagged archived, and synced to the
   * provider — identical to a user archiving it by hand.
   */
  private async executeArchive(
    context: WorkflowContext,
  ): Promise<{ output: unknown }> {
    await this.emailArchiveService.archiveThreadById(
      context.userId,
      context.emailThreadId,
      { viaWorkflow: true },
    );
    return { output: { archived: true, threadId: context.emailThreadId } };
  }

  private async executeReply(
    action: WorkflowActionReply,
    context: WorkflowContext,
  ): Promise<{ output: unknown; resolved: Record<string, string> }> {
    const resolved = await this.variableResolver.resolve(
      { body: action.templateBody },
      context,
    );
    const { body } = resolved;

    // Use the user's primary connected provider (Gmail, Office 365, Zoho, etc.)
    const provider = await this.emailProviderManager.getPrimaryProvider(
      context.userId,
    );
    if (!provider)
      throw new Error("No email provider available for reply action");

    const result = await provider.sendReply(context.userId, {
      threadId: context.emailThreadId,
      to: context.from,
      subject: `Re: ${context.subject}`,
      body,
    });

    return { output: result, resolved };
  }

  private async executeMCPTool(
    action: WorkflowActionMCPTool,
    context: WorkflowContext,
  ): Promise<{ output: unknown; resolved: Record<string, string> }> {
    const resolved = await this.variableResolver.resolve(
      action.parameters,
      context,
    );

    // Convert resolved strings to typed MCP tool arguments
    const toolArgs: Record<string, unknown> = { ...resolved };

    const output = await this.mcpClientManager.callTool(
      action.serverId,
      action.toolName,
      toolArgs,
    );

    return { output, resolved };
  }

  private async executeWebhook(
    action: WorkflowActionWebhook,
    context: WorkflowContext,
  ): Promise<{ output: unknown; resolved: Record<string, string> }> {
    const resolved = await this.variableResolver.resolve(
      { body: action.bodyTemplate },
      context,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(action.headers ?? {}),
    };

    // Guard against SSRF: only allow https:// and reject private/loopback hosts.
    assertSafeOutboundUrl(action.url, "webhook URL");

    // Parse the resolved body template as JSON before sending.
    // Sending a raw string would set Content-Type: application/json but deliver a string,
    // breaking most webhook receivers that expect a parsed JSON object.
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(resolved.body);
    } catch {
      // If the template isn't valid JSON (e.g. plain-text body), send as-is
      parsedBody = resolved.body;
    }

    const response = await axios({
      method: action.method,
      url: action.url,
      headers,
      // eslint-disable-next-line id-denylist -- required by axios AxiosRequestConfig API
      data: parsedBody,
      timeout: WEBHOOK_TIMEOUT_MS,
    });

    const responseBody: unknown = response.data;
    return {
      output: { status: response.status, responseBody },
      resolved,
    };
  }
}
