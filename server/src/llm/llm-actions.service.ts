import { Injectable, Logger } from "@nestjs/common";

import { ACTION_ITEM_TYPES } from "../constants/domain-types";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { isLikelyCompleteJson, safeJsonParse } from "../utils/json";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_EXTRACT_ACTION_ITEMS,
  LLM_OP_SUGGEST_ACTIONS,
  type LLMOperation,
} from "./llm-operations";
import {
  CONTEXT_PROMPT_IDS,
  getPrompt,
  renderPrompt,
  UTILITY_PROMPT_IDS,
} from "./prompts";

/**
 * Domain service for LLM-powered action item extraction and suggested actions.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMActionsService {
  private readonly logger = new Logger(LLMActionsService.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  private async generateText(
    request: {
      prompt: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      jsonMode?: boolean;
      userId?: string;
    },
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    // Action extraction/suggestion runs on the cheapest model by default — AWS
    // Bedrock (Amazon Nova Micro), promptfoo-verified for both operations.
    // Bedrock failures fall back to Gemini inside the core service, and callers
    // can still pass an explicit provider to override.
    return this.llmCoreService.generateText(
      effectiveRequest,
      provider ?? LLMProvider.BEDROCK,
      userId,
    );
  }

  // eslint-disable-next-line better-max-params/better-max-params
  async extractActionItems(
    emailBody: string,
    provider?: LLMProvider,
    userId?: string,
    senderInfo?: { from: string; fromName?: string },
    recipientInfo?: { name?: string; email?: string },
    isUserSender: boolean = false,
    existingActions: string[] = [],
    subject?: string,
    userName: string = "",
  ): Promise<Array<{ description: string; confidence: number }>> {
    const cleanedBody = cleanEmailContent(
      emailBody,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.EXTRACT_ACTION_ITEMS);
    if (!promptConfig) {
      this.logger.error(
        "extract_action_items prompt not found in markdown files - cannot extract action items",
      );
      return [];
    }

    const MAX_EXISTING_ACTIONS = 20;
    const cappedExistingActions = existingActions.slice(
      0,
      MAX_EXISTING_ACTIONS,
    );

    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      body: cleanedBody,
      from: senderInfo?.from || "Unknown",
      fromName: senderInfo?.fromName || senderInfo?.from || "Unknown",
      recipientName: recipientInfo?.name || "You",
      recipientEmail: recipientInfo?.email || "",
      isUserSender,
      perspective: isUserSender ? "SENDER" : "RECIPIENT",
      subject: subject || "",
      userName,
      existingActions:
        cappedExistingActions.length > 0
          ? cappedExistingActions
              .map((action, i) => `${i + 1}. ${action}`)
              .join("\n")
          : "None",
      hasExistingActions: cappedExistingActions.length > 0,
    });

    const response = await this.generateText(
      {
        prompt: fullPrompt,
        systemPrompt: "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_EXTRACT_ACTION_ITEMS,
    );

    try {
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.actionItems || [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM action items response as JSON",
        error,
      );
    }

    return [];
  }

  private buildActionsPromptContext(emailMetadata?: {
    hasGithubLinks?: boolean;
    githubLinks?: Array<{
      type: string;
      owner: string;
      repo: string;
      number: number;
    }>;
    hasCalendarToken?: boolean;
    hasGithubToken?: boolean;
  }): { githubContext: string; integrationsNote: string } {
    const githubContext = emailMetadata?.hasGithubLinks
      ? `\n\nNote: This email contains GitHub links: ${JSON.stringify(emailMetadata.githubLinks)}`
      : "";
    const availableIntegrations: string[] = [];
    if (emailMetadata?.hasGithubToken) availableIntegrations.push("GitHub");
    if (emailMetadata?.hasCalendarToken) availableIntegrations.push("Calendar");
    const integrationsNote =
      availableIntegrations.length > 0
        ? `\n\nAvailable integrations: ${availableIntegrations.join(", ")}`
        : "";
    return { githubContext, integrationsNote };
  }

  private parseAndFilterActions(
    response: string,
    emailMetadata?: { hasGithubToken?: boolean; hasCalendarToken?: boolean },
  ): Array<{
    type: string;
    confidence: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }> {
    const jsonString = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    if (!isLikelyCompleteJson(jsonMatch[0])) {
      this.logger.warn(
        "[parseAndFilterActions] Incomplete JSON from LLM response — returning empty actions",
      );
      return [];
    }
    const parsed = safeJsonParse<Record<string, unknown>>(
      jsonMatch[0],
      null,
      "parseAndFilterActions",
    );
    if (!parsed) return [];
    type ParsedAction = {
      type: string;
      confidence: number;
      reason: string;
      metadata?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const actions = (
      Array.isArray(parsed.actions) ? parsed.actions : []
    ) as ParsedAction[];
    const SCHEDULING_CONFIDENCE_THRESHOLD = RATIOS.HALF;
    const DEFAULT_CONFIDENCE_THRESHOLD = RATIOS.SEVENTY_PERCENT;

    return actions.filter((action) => {
      const threshold =
        action.type === ACTION_ITEM_TYPES.SCHEDULING_REQUEST
          ? SCHEDULING_CONFIDENCE_THRESHOLD
          : DEFAULT_CONFIDENCE_THRESHOLD;
      if (action.confidence < threshold) return false;
      if (action.type?.startsWith("github_") && !emailMetadata?.hasGithubToken)
        return false;
      if (
        action.type?.startsWith("calendar_") &&
        !emailMetadata?.hasCalendarToken
      )
        return false;
      return true;
    });
  }

  async detectSuggestedActions(
    emailContent: {
      subject: string;
      body: string;
      htmlBody?: string;
      from: string;
      fromName?: string;
    },
    emailMetadata?: {
      hasGithubLinks?: boolean;
      githubLinks?: Array<{
        type: string;
        owner: string;
        repo: string;
        number: number;
      }>;
      hasCalendarToken?: boolean;
      hasGithubToken?: boolean;
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{
      type: string;
      confidence: number;
      reason: string;
      metadata?: Record<string, unknown>;
    }>
  > {
    const cleanedBody = cleanEmailContent(
      emailContent.body,
      emailContent.htmlBody || null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.SUGGEST_ACTIONS);
    if (!promptConfig) {
      this.logger.error(
        "suggest_actions prompt not found in markdown files - cannot suggest actions",
      );
      return [];
    }

    const { githubContext, integrationsNote } =
      this.buildActionsPromptContext(emailMetadata);

    const prompt = renderPrompt(promptConfig.prompt || "", {
      subject: emailContent.subject,
      fromName: emailContent.fromName || emailContent.from,
      githubContext: githubContext || "",
      integrationsNote: integrationsNote || "",
      body: cleanedBody,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_SUGGEST_ACTIONS,
    );

    try {
      return this.parseAndFilterActions(response, emailMetadata);
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM suggested actions response as JSON",
        error,
      );
    }

    return [];
  }
}
