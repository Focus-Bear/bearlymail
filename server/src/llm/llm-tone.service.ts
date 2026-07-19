import { Injectable, Logger } from "@nestjs/common";

import { TONE_VALIDATION_STATUS } from "../constants/domain-statuses";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_CHECK_TONE,
  LLM_OP_DISPUTE_TONE_CHECK,
  LLM_OP_REDACT_NAMES,
  LLM_OP_VALIDATE_WRITING_EXAMPLE,
  type LLMOperation,
} from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

/**
 * Domain service for LLM-powered tone checking, dispute resolution, and writing validation.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMToneService {
  private readonly logger = new Logger(LLMToneService.name);

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

  // eslint-disable-next-line better-max-params/better-max-params
  async checkTone(
    text: string,
    rules: string[] = ["Be concise", "Use non-violent communication"],
    provider?: LLMProvider,
    userId?: string,
    scheduledSendAt?: string | null,
    currentTime?: string | null,
  ): Promise<{
    isOk: boolean;
    significance?: "low" | "medium" | "high";
    suggestions: string[];
    revisedText?: string;
    attachmentReminder?: string | null;
    inappropriateTiming?: string | null;
  }> {
    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.CHECK_TONE_STYLE);
    if (!promptConfig) {
      this.logger.error(
        "check_tone_style prompt not found in markdown files - cannot check tone",
      );
      throw new Error("Tone checking prompt not available");
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      rules,
      text,
      currentTime: currentTime ?? null,
      scheduledSendAt: scheduledSendAt ?? null,
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
      LLM_OP_CHECK_TONE,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM tone check response as JSON",
        error,
      );
    }

    return { isOk: true, suggestions: [] };
  }

  // eslint-disable-next-line better-max-params/better-max-params
  async disputeToneCheck(
    emailText: string,
    rules: string[],
    suggestions: string[],
    userArgument: string,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    accepted: boolean;
    rulesToRemove: string[];
    explanation: string;
  }> {
    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.DISPUTE_TONE_CHECK);
    if (!promptConfig) {
      this.logger.error(
        "dispute_tone_check prompt not found in markdown files",
      );
      return {
        accepted: false,
        rulesToRemove: [],
        explanation: "Unable to process dispute - prompt not available",
      };
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      emailText,
      rules,
      suggestions,
      userArgument,
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
      LLM_OP_DISPUTE_TONE_CHECK,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          accepted: !!parsed.accepted,
          rulesToRemove: Array.isArray(parsed.rulesToRemove)
            ? parsed.rulesToRemove
            : [],
          explanation: parsed.explanation || "",
        };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM dispute tone check response as JSON",
        error,
      );
    }

    return {
      accepted: false,
      rulesToRemove: [],
      explanation: "Unable to process your argument",
    };
  }

  /**
   * Redact person names from text using LLM for better accuracy.
   * Replaces names with [Name] placeholder.
   */
  async redactNamesWithLLM(text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      return text;
    }

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.REDACT_NAMES);
    if (!promptConfig) {
      this.logger.warn(
        "redact_names prompt not found - falling back to original text",
      );
      return text;
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      text,
    });

    try {
      const redacted = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0.1,
          maxTokens: text.length + 100,
        },
        undefined,
        undefined,
        LLM_OP_REDACT_NAMES,
      );

      if (redacted && redacted.trim().length > 0) {
        return redacted.trim();
      }

      return text;
    } catch (error) {
      this.logger.error("Failed to redact names with LLM:", error);
      return text;
    }
  }

  async validateWritingExample(text: string): Promise<string | null> {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.VALIDATE_WRITING_EXAMPLE);
    if (!promptConfig) {
      this.logger.warn(
        "validate_writing_example prompt not found - falling back to redactNamesWithLLM",
      );
      return this.redactNamesWithLLM(text);
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      text,
    });

    try {
      const result = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0.1,
          maxTokens: text.length + QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
          jsonMode: true,
        },
        undefined,
        undefined,
        LLM_OP_VALIDATE_WRITING_EXAMPLE,
      );

      const trimmed = result?.trim();
      if (!trimmed) {
        return null;
      }

      const cleaned = trimmed
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.status === TONE_VALIDATION_STATUS.REJECTED) {
          this.logger.debug(
            `Writing example rejected: ${parsed.reason || "no reason given"}`,
          );
          return null;
        }
        if (
          parsed.status === TONE_VALIDATION_STATUS.VALID &&
          parsed.cleanedText
        ) {
          return parsed.cleanedText;
        }
        this.logger.warn(
          `Unexpected JSON structure from validateWritingExample: ${cleaned.substring(0, 100)}`,
        );
        return null;
      } catch (_parseError) {
        this.logger.warn(
          `Failed to parse validateWritingExample JSON response: ${cleaned.substring(0, 100)}`,
        );
        return null;
      }
    } catch (error) {
      this.logger.error("Failed to validate writing example with LLM:", error);
      return null;
    }
  }
}
