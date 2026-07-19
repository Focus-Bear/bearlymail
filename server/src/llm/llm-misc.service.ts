import { Injectable, Logger } from "@nestjs/common";

import {
  BODY_PREVIEW_LENGTHS,
  QA_EXTRACTION,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import { cleanEmailContent } from "./email-content-cleaner";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_OVERRIDE_REASON,
  LLM_OP_COMPRESS_CONTEXT,
  LLM_OP_EXTRACT_QANDA,
  type LLMOperation,
} from "./llm-operations";
import {
  CONTEXT_PROMPT_IDS,
  getPrompt,
  PRIORITY_PROMPT_IDS,
  renderPrompt,
} from "./prompts";

/**
 * Domain service for miscellaneous LLM operations: override analysis, Q&A extraction, context compression.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMMiscService {
  private readonly logger = new Logger(LLMMiscService.name);

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
    return this.llmCoreService.generateText(effectiveRequest, provider, userId);
  }

  /**
   * Analyze override reason to extract rules and suggest context updates.
   */
  // eslint-disable-next-line better-max-params/better-max-params
  async analyzeOverrideReason(
    email: {
      from: string;
      fromName?: string | null;
      subject: string;
      body: string;
    },
    reasonType: string,
    reasonText: string,
    currentContext: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number | null;
    }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    suggestedRules: string[];
    updatedContexts: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number;
    }>;
  }> {
    const cleanedBody = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const _contextSummary = currentContext
      .slice(0, 10)
      .map((item) => `${item.contextKey}: ${item.contextValue}`)
      .join("\n");

    const promptConfig = getPrompt(
      PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY_FEEDBACK,
    );
    if (!promptConfig) {
      this.logger.error(
        "analyze_priority_feedback prompt not found in markdown files - cannot analyze feedback",
      );
      return { suggestedRules: [], updatedContexts: [] };
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      fromName: email.fromName || email.from,
      subject: email.subject,
      body: cleanedBody.substring(0, QUERY_LIMITS.SUBSTRING_BODY_PREVIEW),
      reasonType,
      reason: reasonText,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_ANALYZE_OVERRIDE_REASON,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedRules: parsed.suggestedRules || [],
          updatedContexts: parsed.updatedContexts || [],
        };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM override reason analysis response as JSON",
        error,
      );
    }

    return {
      suggestedRules: [],
      updatedContexts: [],
    };
  }

  async extractQAndA(
    userReplies: Array<{
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Array<{ question: string; answer: string; frequency: number }>> {
    const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.EXTRACT_COMMON_QUESTIONS);
    if (!promptConfig) {
      this.logger.error(
        "extract_common_questions prompt not found in markdown files - cannot extract questions",
      );
      return [];
    }

    const cleanReplies = userReplies.map((emailEntry) => {
      const body = cleanEmailContent(
        emailEntry.body,
        null,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      );
      return `Subject: ${emailEntry.subject}\nBody: ${body}`;
    });

    const repliesText = cleanReplies.join("\n\n---\n\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      repliesText,
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
      LLM_OP_EXTRACT_QANDA,
    );

    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      let parsedArr: unknown[] | null = null;
      const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        const parsedObj = JSON.parse(jsonObjMatch[0]) as Record<
          string,
          unknown
        >;
        if (Array.isArray(parsedObj.qa_pairs)) {
          parsedArr = parsedObj.qa_pairs;
        } else {
          const arrayKey = Object.keys(parsedObj).find((key) =>
            Array.isArray(parsedObj[key]),
          );
          if (arrayKey) {
            this.logger.warn(
              `[QA-EXTRACTION] Expected key 'qa_pairs' but found '${arrayKey}'. Using fallback.`,
            );
            parsedArr = parsedObj[arrayKey] as unknown[];
          }
        }
      }
      if (!parsedArr) {
        const jsonArrMatch = jsonString.match(/\[[\s\S]*\]/);
        if (jsonArrMatch) {
          this.logger.warn(
            `[QA-EXTRACTION] Response was a bare array instead of wrapped object. Accepting with warning.`,
          );
          parsedArr = JSON.parse(jsonArrMatch[0]) as unknown[];
        }
      }
      if (Array.isArray(parsedArr)) {
        return (
          parsedArr as Array<{
            question: string;
            answer: string;
            frequency: number;
          }>
        ).filter((qa) => (qa.frequency ?? 0) >= QA_EXTRACTION.MIN_FREQUENCY);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM Q&A extraction response as JSON",
        error,
      );
    }

    return [];
  }

  async compressUserContext(
    items: Array<{
      key: string;
      value: string;
      priority?: number;
      explanation?: string;
    }>,
    maxItemsPerKey: number,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    items: Array<{
      key: string;
      value: string;
      priority?: number;
      explanation?: string;
    }>;
    notes?: string;
  }> {
    this.logger.log(
      `[CONTEXT-COMPRESSION] Compressing ${items.length} context items (max ${maxItemsPerKey} per key)`,
    );

    const fallback = { items, notes: "Compression skipped - using originals" };

    const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.COMPRESS_USER_CONTEXT);
    if (!promptConfig) {
      this.logger.warn(
        "compress_user_context prompt not found - returning original items",
      );
      return fallback;
    }

    const contextItemsText = items
      .map(
        (item) =>
          `- Key: ${item.key}, Value: ${item.value}, Priority: ${item.priority ?? 0}, Explanation: ${item.explanation ?? ""}`,
      )
      .join("\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      contextItems: contextItemsText,
      maxItemsPerKey: String(maxItemsPerKey),
    });

    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
          jsonMode: true,
          userId,
        },
        provider,
        userId,
        LLM_OP_COMPRESS_CONTEXT,
      );

      if (!response) {
        this.logger.warn("[CONTEXT-COMPRESSION] Empty response from LLM");
        return fallback;
      }

      let jsonString = response.trim();
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonString = jsonMatch[0];

      const parsed = JSON.parse(jsonString);
      const result =
        parsed.result && typeof parsed.result === "object"
          ? parsed.result
          : parsed;

      if (!Array.isArray(result.items)) {
        this.logger.warn(
          "[CONTEXT-COMPRESSION] Invalid response structure - no items array",
        );
        return fallback;
      }

      const validItems = result.items.filter(
        (item: { key?: string; value?: string }) =>
          item.key &&
          typeof item.key === "string" &&
          item.value &&
          typeof item.value === "string",
      );

      this.logger.log(
        `[CONTEXT-COMPRESSION] Compressed ${items.length} items to ${validItems.length}`,
      );

      return {
        items: validItems,
        notes: result.notes || undefined,
      };
    } catch (error) {
      this.logger.error(
        `[CONTEXT-COMPRESSION] Error: ${getErrorMessage(error)}`,
      );
      return fallback;
    }
  }
}
