import { Injectable, Logger } from "@nestjs/common";

import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_RESOLVE_WORKFLOW_VARIABLES } from "../llm/llm-operations";
import { WorkflowContext } from "./types/workflow.types";

const AI_PLACEHOLDER_REGEX = /\{\{ai:([^}]+)\}\}/g;
const BUILTIN_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/** Max email body chars sent to the LLM for variable resolution */
const MAX_BODY_CHARS = 4000;

/**
 * Resolves {{variable}} and {{ai:instruction}} placeholders in workflow
 * action parameter templates.
 *
 * Built-in variables are substituted deterministically from WorkflowContext.
 * {{ai:...}} variables are resolved via a single batched LLM call to minimise
 * token spend.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class WorkflowVariableResolver {
  private readonly logger = new Logger(WorkflowVariableResolver.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  /**
   * Fully resolve a parameter map, substituting all {{...}} placeholders.
   *
   * @param template  - Record of key → template string (may contain placeholders)
   * @param context   - Email context for built-in variable resolution
   * @returns Resolved parameter record (placeholders replaced with values)
   */
  async resolve(
    template: Record<string, string>,
    context: WorkflowContext,
  ): Promise<Record<string, string>> {
    const builtins = this.buildBuiltinMap(context);

    // Phase 1: substitute built-in variables in every template value
    const afterBuiltins: Record<string, string> = {};
    for (const [key, value] of Object.entries(template)) {
      afterBuiltins[key] = this.substituteBuiltins(value, builtins);
    }

    // Phase 2: collect all remaining {{ai:...}} instructions across all values
    const aiInstructions: Array<{
      key: string;
      instruction: string;
      fullMatch: string;
    }> = [];
    for (const [key, value] of Object.entries(afterBuiltins)) {
      const matches = [...value.matchAll(AI_PLACEHOLDER_REGEX)];
      for (const match of matches) {
        aiInstructions.push({
          key,
          instruction: match[1].trim(),
          fullMatch: match[0],
        });
      }
    }

    if (aiInstructions.length === 0) {
      return afterBuiltins;
    }

    // Phase 3: single LLM call to resolve all AI variables
    const aiResults = await this.resolveAIVariables(
      aiInstructions.map((aiItem) => aiItem.instruction),
      context,
    );

    // Phase 4: substitute AI results back.
    // aiResults entries are null when the LLM failed (not the same as a
    // legitimate empty-string response, which is preserved as-is).
    const resolved = { ...afterBuiltins };
    for (const [index, item] of aiInstructions.entries()) {
      const fallback = `[AI could not resolve: ${item.instruction}]`;
      const aiValue = aiResults[index] ?? fallback;
      resolved[item.key] = resolved[item.key].replace(item.fullMatch, aiValue);
    }

    return resolved;
  }

  /**
   * Resolve a single template string (e.g. a webhook body template).
   */
  async resolveString(
    template: string,
    context: WorkflowContext,
  ): Promise<string> {
    const record = await this.resolve({ v: template }, context);
    return record.v;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildBuiltinMap(ctx: WorkflowContext): Record<string, string> {
    // toISOString() returns "YYYY-MM-DDTHH:mm:ss.sssZ"; split at T to get date portion
    const dateIso = ctx.date.toISOString().split("T")[0];
    return {
      from: ctx.from,
      fromName: ctx.fromName,
      subject: ctx.subject,
      date: dateIso,
      summary: ctx.summary,
      body: ctx.body.slice(0, MAX_BODY_CHARS),
      category: ctx.category,
      priority: ctx.priority,
      threadId: ctx.emailThreadId,
    };
  }

  private substituteBuiltins(
    template: string,
    builtins: Record<string, string>,
  ): string {
    return template.replace(BUILTIN_PLACEHOLDER_REGEX, (match, key) => {
      // Skip {{ai:...}} — handled in phase 3
      if (key.startsWith("ai:")) return match;

      // Handle {{date:FORMAT}} — format using the email's received date from builtins
      if (key.startsWith("date:")) {
        const format = key.slice(5);
        // Reconstruct Date from ISO date stored in builtins.date
        const emailDate = new Date(`${builtins.date}T00:00:00Z`);
        return this.formatDate(emailDate, format);
      }

      return builtins[key.trim()] ?? match;
    });
  }

  /**
   * Date formatter supporting common patterns.
   *
   * Uses a single-pass regex replacement to avoid chain-replace corruption
   * where shorter tokens (e.g. "M") match inside the output of longer token
   * replacements (e.g. "MMMM" → "March" → "3arch" when "M" is applied next).
   *
   * Supported tokens (longest-match wins): MMMM, MMM, MM, M, YYYY, YY, DD, D
   */
  private formatDate(date: Date, format: string): string {
    const padZero = (value: number) => String(value).padStart(2, "0");
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

    const LAST_TWO_DIGITS = -2;
    const TOKEN_RE = /MMMM|MMM|MM|M|YYYY|YY|DD|D/g;
    return format.replace(TOKEN_RE, (token) => {
      switch (token) {
        case "MMMM":
          return MONTHS[date.getUTCMonth()];
        case "MMM":
          return SHORT_MONTHS[date.getUTCMonth()];
        case "MM":
          return padZero(date.getUTCMonth() + 1);
        case "M":
          return String(date.getUTCMonth() + 1);
        case "YYYY":
          return String(date.getUTCFullYear());
        case "YY":
          return String(date.getUTCFullYear()).slice(LAST_TWO_DIGITS);
        case "DD":
          return padZero(date.getUTCDate());
        case "D":
          return String(date.getUTCDate());
        default:
          return token;
      }
    });
  }

  private async resolveAIVariables(
    instructions: string[],
    context: WorkflowContext,
  ): Promise<Array<string | null>> {
    const emailContext = [
      `From: ${context.from}`,
      `Subject: ${context.subject}`,
      `Date: ${context.date.toISOString()}`,
      `Summary: ${context.summary}`,
      `Body:\n${context.body.slice(0, MAX_BODY_CHARS)}`,
    ].join("\n");

    const numbered = instructions
      .map((inst, index) => `${index + 1}. ${inst}`)
      .join("\n");

    const prompt = [
      "You are a data extraction assistant. Given the email below, complete each numbered task.",
      "Respond with a JSON object mapping each task number (as a string key) to its result.",
      'Example: {"1": "result one", "2": "result two"}',
      "",
      "EMAIL CONTEXT:",
      emailContext,
      "",
      "TASKS:",
      numbered,
    ].join("\n");

    try {
      const response = await this.llmCoreService.generateText({
        userId: context.userId,
        prompt,
        operation: LLM_OP_RESOLVE_WORKFLOW_VARIABLES,
        maxTokens: 1024,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in LLM response");

      const parsed: Record<string, string> = JSON.parse(jsonMatch[0]);
      // Return null (not "") for missing keys so phase 4 ?? triggers the fallback
      // only for genuinely missing/failed entries, not for empty-string LLM responses.
      return instructions.map((_, index) => parsed[String(index + 1)] ?? null);
    } catch (error) {
      this.logger.error(
        `Failed to resolve AI workflow variables: ${(error as Error).message}`,
      );
      // Return null for all instructions on failure so ?? triggers the fallback text
      return instructions.map(() => null);
    }
  }
}
