import { Injectable, Logger } from "@nestjs/common";

import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_VERIFY_DISTRACTION_PHRASE } from "../llm/llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "../llm/prompts";
import {
  DISTRACTION_CONFESSION_PHRASE,
  VERIFY_DISTRACTION_PHRASE_MAX_TOKENS,
} from "./triage.constants";

/**
 * Triage "distraction tax" logic. Uses the LLM to semantically verify that a
 * (rough, speech-to-text) transcript is a good-faith attempt at the confession
 * phrase before revealing lower-priority emails.
 */
@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  /**
   * Semantically verify that the spoken transcript matches the distraction
   * confession phrase, tolerant of speech-to-text errors and paraphrasing.
   *
   * Returns `false` on empty input, a missing prompt, an LLM failure, or an
   * unparseable reply so a broken verifier never accidentally unlocks.
   */
  async verifyDistractionPhrase(
    transcript: string,
    userId: string,
  ): Promise<boolean> {
    const trimmed = transcript?.trim() ?? "";
    if (!trimmed) {
      return false;
    }

    const promptConfig = getPrompt(
      UTILITY_PROMPT_IDS.VERIFY_DISTRACTION_PHRASE,
    );
    if (!promptConfig) {
      this.logger.error(
        "[VERIFY-DISTRACTION-PHRASE] verify_distraction_phrase prompt not found",
      );
      return false;
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      transcript: trimmed,
      targetPhrase: DISTRACTION_CONFESSION_PHRASE,
    });

    try {
      const response = await this.llmCoreService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0,
          maxTokens: VERIFY_DISTRACTION_PHRASE_MAX_TOKENS,
          jsonMode: true,
          operation: LLM_OP_VERIFY_DISTRACTION_PHRASE,
        },
        undefined,
        userId,
      );

      return this.parseVerifiedFlag(response);
    } catch (error) {
      this.logger.warn(
        `[VERIFY-DISTRACTION-PHRASE] LLM verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Extract the boolean `verified` flag from the model reply, tolerating stray
   * markdown fences and surrounding prose.
   */
  private parseVerifiedFlag(response: string): boolean {
    const jsonMatch = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
      .match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      this.logger.warn(
        "[VERIFY-DISTRACTION-PHRASE] No JSON object found in LLM response",
      );
      return false;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { verified?: boolean };
    return parsed.verified === true;
  }
}
