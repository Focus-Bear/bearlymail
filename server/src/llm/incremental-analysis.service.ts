import { Injectable, Logger } from "@nestjs/common";

import { QUERY_LIMITS } from "../constants/query-limits";
import { safeJsonParse } from "../utils/json";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_INCREMENTAL_PRIORITY_CHECK,
  LLM_OP_INCREMENTAL_SUMMARY,
} from "./llm-operations";
import {
  CONTEXT_PROMPT_IDS,
  getPrompt,
  PRIORITY_PROMPT_IDS,
  renderPrompt,
} from "./prompts";

export interface IncrementalPriorityCheckResult {
  needsFullRecalc: boolean;
  reason: string;
  suggestedUrgencyDelta: number;
  categoryMightChange: boolean;
}

export interface IncrementalSummaryResult {
  updatedSummary: string;
  significantChange: boolean;
  suggestedContactType?: string | null;
  contactTypeConfidence?: number;
}

export interface ExistingThreadState {
  priorityScore: number;
  urgencyScore: number;
  category: string | null;
  summary: string | null;
}

export interface NewEmailData {
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
}

const INCREMENTAL_CONSTANTS = {
  NEW_EMAIL_BODY_MAX_LENGTH: 800,
  THREAD_CONTEXT_MAX_LENGTH: 1500,
};

@Injectable()
export class IncrementalAnalysisService {
  private readonly logger = new Logger(IncrementalAnalysisService.name);

  constructor(private llmCoreService: LLMCoreService) {}

  /**
   * Check if a thread needs full priority/category recalculation after a new message arrives.
   * This is a lightweight check that saves tokens by avoiding full analysis when unnecessary.
   */
  async checkIfRecalcNeeded(
    existingState: ExistingThreadState,
    newEmail: NewEmailData,
    threadContext?: string,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<IncrementalPriorityCheckResult> {
    const promptConfig = getPrompt(
      PRIORITY_PROMPT_IDS.INCREMENTAL_PRIORITY_CHECK,
    );
    if (!promptConfig) {
      this.logger.warn(
        "incremental priority check prompt not found, defaulting to full recalc",
      );
      return {
        needsFullRecalc: true,
        reason: "Prompt not found",
        suggestedUrgencyDelta: 0,
        categoryMightChange: false,
      };
    }

    const cleanedBody = cleanEmailContent(
      newEmail.body,
      newEmail.htmlBody,
      INCREMENTAL_CONSTANTS.NEW_EMAIL_BODY_MAX_LENGTH,
    );

    const renderedPrompt = renderPrompt(promptConfig.prompt, {
      existingPriorityScore: existingState.priorityScore,
      existingUrgencyScore: existingState.urgencyScore,
      existingCategory: existingState.category || "Unknown",
      existingSummary: existingState.summary || "No summary available",
      newEmailFrom: newEmail.from,
      newEmailFromName: newEmail.fromName || "",
      newEmailSubject: newEmail.subject,
      newEmailBody: cleanedBody,
      newEmailReceivedAt: newEmail.receivedAt.toISOString(),
      threadContext: threadContext || "",
    });

    try {
      // Runs on the cheapest model by default — AWS Bedrock (Amazon Nova
      // Micro), promptfoo-verified 7/7 for this prompt (unlike the full
      // prioritise-email prompt, which underperforms on Nova). Bedrock
      // failures fall back to Gemini inside the core service.
      const response = await this.llmCoreService.generateText(
        {
          prompt: renderedPrompt,
          operation: LLM_OP_INCREMENTAL_PRIORITY_CHECK,
        },
        provider ?? LLMProvider.BEDROCK,
        userId,
      );

      const parsed = this.parseJsonResponse<{
        result: IncrementalPriorityCheckResult;
      }>(response);

      if (parsed?.result) {
        this.logger.log(
          `Incremental priority check: needsFullRecalc=${parsed.result.needsFullRecalc}, reason="${parsed.result.reason}"`,
        );
        return parsed.result;
      }

      this.logger.warn(
        "Failed to parse incremental priority check response, defaulting to full recalc",
      );
      return {
        needsFullRecalc: true,
        reason: "Parse error",
        suggestedUrgencyDelta: 0,
        categoryMightChange: false,
      };
    } catch (error) {
      this.logger.error("Incremental priority check failed:", error);
      return {
        needsFullRecalc: true,
        reason: "Error during check",
        suggestedUrgencyDelta: 0,
        categoryMightChange: false,
      };
    }
  }

  /**
   * Update a thread's summary incrementally based on a new message.
   * Much faster and cheaper than regenerating the full summary.
   * @param needsContactTypeGuess If true, the LLM will also guess the sender's contact type
   */
  async updateSummaryIncrementally(options: {
    existingSummary: string;
    newEmail: NewEmailData;
    isResolution?: boolean;
    provider?: LLMProvider;
    userId?: string;
    needsContactTypeGuess?: boolean;
  }): Promise<IncrementalSummaryResult> {
    const {
      existingSummary,
      newEmail,
      isResolution,
      provider,
      userId,
      needsContactTypeGuess,
    } = options;
    const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.INCREMENTAL_SUMMARY);
    if (!promptConfig) {
      this.logger.warn("incremental summary prompt not found");
      return {
        updatedSummary: existingSummary,
        significantChange: false,
      };
    }

    const cleanedBody = cleanEmailContent(
      newEmail.body,
      newEmail.htmlBody,
      INCREMENTAL_CONSTANTS.NEW_EMAIL_BODY_MAX_LENGTH,
    );

    const renderedPrompt = renderPrompt(promptConfig.prompt, {
      existingSummary,
      newEmailFrom: newEmail.from,
      newEmailFromName: newEmail.fromName || "",
      newEmailSubject: newEmail.subject,
      newEmailBody: cleanedBody,
      newEmailReceivedAt: newEmail.receivedAt.toISOString(),
      isResolution: isResolution || false,
      needsContactTypeGuess: needsContactTypeGuess || false,
    });

    try {
      // Incremental summaries run on the cheapest model by default — AWS
      // Bedrock (Amazon Nova Micro), promptfoo-verified. Bedrock failures fall
      // back to Gemini inside the core service.
      const response = await this.llmCoreService.generateText(
        {
          prompt: renderedPrompt,
          operation: LLM_OP_INCREMENTAL_SUMMARY,
        },
        provider ?? LLMProvider.BEDROCK,
        userId,
      );

      const parsed = this.parseJsonResponse<{
        result: IncrementalSummaryResult;
      }>(response);

      if (parsed?.result?.updatedSummary) {
        this.logger.log(
          `Incremental summary update: significantChange=${parsed.result.significantChange}${
            needsContactTypeGuess
              ? `, suggestedContactType=${parsed.result.suggestedContactType}`
              : ""
          }`,
        );
        return parsed.result;
      }

      this.logger.warn("Failed to parse incremental summary response");
      return {
        updatedSummary: existingSummary,
        significantChange: false,
      };
    } catch (error) {
      this.logger.error("Incremental summary update failed:", error);
      return {
        updatedSummary: existingSummary,
        significantChange: false,
      };
    }
  }

  /**
   * Format thread context for the incremental check prompt.
   * Only includes recent messages to keep context size small.
   */
  formatThreadContextForIncremental(
    threadEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: Date;
    }>,
    maxMessages: number = 3,
  ): string {
    if (!threadEmails || threadEmails.length === 0) {
      return "";
    }

    const recentEmails = threadEmails.slice(-maxMessages);
    let context = "";
    let totalLength = 0;

    for (const email of recentEmails) {
      const sender = email.fromName || email.from;
      const dateStr = email.receivedAt.toISOString().split("T")[0];
      const bodyPreview = cleanEmailContent(
        email.body,
        undefined,
        QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH,
      );
      const entry = `[${sender} on ${dateStr}]: ${bodyPreview}\n\n`;

      if (
        totalLength + entry.length >
        INCREMENTAL_CONSTANTS.THREAD_CONTEXT_MAX_LENGTH
      ) {
        break;
      }

      context += entry;
      totalLength += entry.length;
    }

    return context.trim();
  }

  private parseJsonResponse<T>(response: string): T | null {
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    return safeJsonParse<T | null>(jsonStr, null, "parseJsonResponse");
  }
}
