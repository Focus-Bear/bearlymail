import { Injectable, Logger } from "@nestjs/common";

import {
  BODY_PREVIEW_LENGTHS,
  RECENCY_THRESHOLDS,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { safeJsonParse } from "../utils/json";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_SEARCH_RELEVANCE,
  LLM_OP_SEARCH_RELEVANCE_BATCH,
  type LLMOperation,
} from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

/**
 * Domain service for LLM-powered search relevance explanation.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMSearchService {
  private readonly logger = new Logger(LLMSearchService.name);

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
    // Search relevance runs on the cheapest model by default — AWS Bedrock
    // (Amazon Nova Micro), promptfoo-verified for the search prompts. Bedrock
    // failures fall back to Gemini inside the core service, and callers can
    // still pass an explicit provider to override.
    return this.llmCoreService.generateText(
      effectiveRequest,
      provider ?? LLMProvider.BEDROCK,
      userId,
    );
  }

  async generateSearchRelevanceExplanation(
    query: string,
    email: {
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    },
    userId?: string,
    provider?: LLMProvider,
  ): Promise<string> {
    const promptConfig = getPrompt(
      UTILITY_PROMPT_IDS.SEARCH_RELEVANCE_EXPLANATION,
    );
    if (!promptConfig) {
      this.logger.error("search_relevance_explanation prompt not found");
      return "";
    }

    const receivedDate = new Date(email.receivedAt);
    const now = new Date();
    const daysAgo = Math.floor(
      (now.getTime() - receivedDate.getTime()) / MILLISECONDS.DAY,
    );
    const isRecent = daysAgo <= RECENCY_THRESHOLDS.RECENT_DAYS;
    let receivedAtText: string;
    if (daysAgo === 0) {
      receivedAtText = "today";
    } else if (daysAgo === 1) {
      receivedAtText = "yesterday";
    } else {
      receivedAtText = `${daysAgo} days ago`;
    }

    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      from: email.from,
      subject: email.subject,
      bodyPreview: cleanEmailContent(
        email.body,
        null,
        BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
      ),
      receivedAt: receivedAtText,
      isRecent: isRecent ? " (recent)" : "",
    });

    const response = await this.generateText(
      {
        prompt: fullPrompt,
        systemPrompt:
          "You are a helpful email search assistant. Provide concise, specific explanations.",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_VERY_SMALL,
        userId,
      },
      provider,
      userId,
      LLM_OP_SEARCH_RELEVANCE,
    );

    return response.trim();
  }

  private buildBatchEmailDetails(
    emails: Array<{
      index: number;
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    now: Date,
  ): Array<{
    index: number;
    from: string;
    subject: string;
    bodyPreview: string;
    receivedAt: string;
    isRecent: string;
  }> {
    return emails.map((email) => {
      const receivedDate = new Date(email.receivedAt);
      const daysAgo = Math.floor(
        (now.getTime() - receivedDate.getTime()) / MILLISECONDS.DAY,
      );
      let receivedAtText: string;
      if (daysAgo === 0) {
        receivedAtText = "today";
      } else if (daysAgo === 1) {
        receivedAtText = "yesterday";
      } else {
        receivedAtText = `${daysAgo} days ago`;
      }
      return {
        index: email.index,
        from: email.from,
        subject: email.subject,
        bodyPreview: cleanEmailContent(
          email.body,
          null,
          BODY_PREVIEW_LENGTHS.BATCH_PREVIEW,
        ),
        receivedAt: receivedAtText,
        isRecent: daysAgo <= RECENCY_THRESHOLDS.RECENT_DAYS ? " (recent)" : "",
      };
    });
  }

  private parseBatchExplanationJson(
    jsonStr: string,
    query: string,
    emailDetailList: Array<{ index: number; [key: string]: unknown }>,
  ): Map<number, string> {
    const explanations = safeJsonParse<Record<string, unknown> | null>(
      jsonStr,
      null,
      "parseBatchExplanationJson",
    );
    if (
      explanations === null ||
      typeof explanations !== "object" ||
      Array.isArray(explanations)
    ) {
      throw new Error("Response is not a JSON object");
    }
    const result = new Map<number, string>();
    this.logger.debug(
      `Parsed JSON explanations. Type: ${typeof explanations}, Keys: ${Object.keys(explanations).join(", ")}`,
    );
    emailDetailList.forEach((email) => {
      const explanation =
        explanations[email.index] ||
        explanations[String(email.index)] ||
        explanations[email.index.toString()] ||
        explanations[`${email.index}`];
      if (
        explanation &&
        typeof explanation === "string" &&
        explanation.trim().length > 0
      ) {
        result.set(email.index, explanation.trim());
      } else {
        this.logger.warn(
          `Missing explanation for email index ${email.index}. Available keys: ${Object.keys(explanations).join(", ")}`,
        );
        result.set(
          email.index,
          `Relevant to "${query}" based on sender, subject, or content.`,
        );
      }
    });
    this.logger.debug(
      `Batch explanation complete. Generated ${result.size} explanations out of ${emailDetailList.length} emails.`,
    );
    if (result.size === 0) {
      this.logger.error(
        `No explanations generated! JSON keys: ${Object.keys(explanations).join(", ")}, Expected indices: ${emailDetailList.map((emailEntry) => emailEntry.index).join(", ")}`,
      );
    }
    return result;
  }

  private async generateExplanationChunk(
    query: string,
    emailChunk: Array<{
      index: number;
      from: string;
      subject: string;
      bodyPreview: string;
      receivedAt: string;
      isRecent: string;
    }>,
    promptConfig: { prompt?: string; systemPrompt?: string },
    userId: string | undefined,
    provider: LLMProvider | undefined,
  ): Promise<Map<number, string>> {
    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      emails: emailChunk,
    });

    this.logger.debug(
      `Explanation chunk: ${emailChunk.length} emails, prompt length: ${fullPrompt.length}`,
    );

    if (!fullPrompt.includes("Email") || !fullPrompt.includes("index:")) {
      this.logger.error(
        "Rendered prompt does not contain email details! Prompt may not have rendered correctly.",
      );
    }

    const response = await this.generateText(
      {
        prompt: fullPrompt,
        systemPrompt:
          "You are a helpful email search assistant. Return only valid JSON objects.",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: Math.min(
          QUERY_LIMITS.LLM_BATCH_EXPLANATION_BASE,
          emailChunk.length * QUERY_LIMITS.LLM_BATCH_EXPLANATION_PER_EMAIL,
        ),
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_SEARCH_RELEVANCE_BATCH,
    );

    this.logger.debug(
      `Chunk response received. Length: ${response.length}, First ${QUERY_LIMITS.LLM_REASONING_MAX_LENGTH} chars: ${response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH)}`,
    );

    let jsonStr: string | null = null;

    const directMatch = response.match(/\{[\s\S]*\}/);
    if (directMatch) jsonStr = directMatch[0];

    if (!jsonStr) {
      const codeBlockMatch = response.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      );
      if (codeBlockMatch?.[1]) jsonStr = codeBlockMatch[1];
    }

    if (!jsonStr) {
      const afterTextMatch = response.match(
        /(?:return|json|result)[\s:]*(\{[\s\S]*\})/i,
      );
      if (afterTextMatch?.[1]) jsonStr = afterTextMatch[1];
    }

    if (jsonStr) {
      try {
        return this.parseBatchExplanationJson(jsonStr, query, emailChunk);
      } catch (parseError) {
        this.logger.error(
          `Failed to parse JSON from chunk explanation response:`,
          parseError,
        );
        this.logger.error(
          `JSON string that failed to parse: ${jsonStr.substring(0, QUERY_LIMITS.SUBSTRING_BODY_PREVIEW)}`,
        );
      }
    } else {
      this.logger.error(
        `Failed to find JSON in chunk explanation response. Full response (first ${BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW} chars):\n${response.substring(0, BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW)}`,
      );
    }

    return new Map();
  }

  async generateSearchRelevanceExplanationsBatch(
    query: string,
    emails: Array<{
      index: number;
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Map<number, string>> {
    if (emails.length === 0) {
      return new Map();
    }

    const promptConfig = getPrompt(
      UTILITY_PROMPT_IDS.SEARCH_RELEVANCE_EXPLANATION,
    );
    if (!promptConfig) {
      this.logger.error("search_relevance_explanation prompt not found");
      return new Map();
    }

    const emailDetails = this.buildBatchEmailDetails(emails, new Date());

    if (!Array.isArray(emailDetails) || emailDetails.length === 0) {
      this.logger.warn(
        "generateSearchRelevanceExplanationsBatch called with empty or invalid emails array",
      );
      return new Map();
    }

    const chunkSize = QUERY_LIMITS.LLM_BATCH_EXPLANATION_CHUNK_SIZE;
    const chunks: (typeof emailDetails)[] = [];
    for (let i = 0; i < emailDetails.length; i += chunkSize) {
      chunks.push(emailDetails.slice(i, i + chunkSize));
    }

    this.logger.debug(
      `Batch explanation: ${emails.length} emails split into ${chunks.length} chunk(s) of ≤${chunkSize}`,
    );

    const result = new Map<number, string>();

    for (const chunk of chunks) {
      try {
        const chunkResult = await this.generateExplanationChunk(
          query,
          chunk,
          promptConfig,
          userId,
          provider,
        );
        chunkResult.forEach((value, key) => result.set(key, value));
      } catch (error) {
        this.logger.error(
          `Explanation chunk failed (indices ${chunk.map((email) => email.index).join(",")})`,
          error,
        );
        this.logger.error(
          `Error details: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }
}
