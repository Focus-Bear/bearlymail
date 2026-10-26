import type { Logger } from "@nestjs/common";

import { JEV } from "../constants/jev.constants";
import { PERCENTAGES } from "../constants/percentages";
import { ENV_BOOLEAN_STRING } from "../constants/service-constants";
import {
  buildJevCategoryRequest,
  type JevCategoryAnswer,
  requestJevCategory,
} from "./jev-category-request";
import {
  JEV_OUTCOMES,
  logJevConfidence,
  runnerUpMargin,
} from "./jev-confidence-log";
import type {
  CategoriseFromSummaryParams,
  CategoriseFromSummaryResult,
} from "./llm-categorise-summary";
import { LLM_OP_CATEGORISE_SUMMARY } from "./llm-operations";
import type { TokenUsageService } from "./token-usage.service";

/** Jev's below-threshold pick, reported only so agreement with the fallback can be measured. */
export interface JevDeclinedPick {
  categoryName: string;
  confidence: number;
}

export class JevCategoryClient {
  constructor(
    private readonly getConfig: (key: string) => string | undefined,
    private readonly logger: Pick<Logger, "warn" | "log">,
    private readonly tokenUsage: Pick<TokenUsageService, "logUsage">,
  ) {}

  async categorise(
    params: CategoriseFromSummaryParams,
    onDeclined?: (pick: JevDeclinedPick) => void,
  ): Promise<CategoriseFromSummaryResult | null> {
    const apiKey = this.getConfig(JEV.API_KEY_ENV);
    if (
      !apiKey ||
      this.getConfig(JEV.ENABLED_ENV) === ENV_BOOLEAN_STRING.FALSE ||
      !params.summary?.trim() ||
      !params.categories.length
    )
      return null;
    try {
      const request = buildJevCategoryRequest(
        params,
        this.getConfig(JEV.MODEL_ENV) || JEV.DEFAULT_MODEL,
      );
      const startedAt = Date.now();
      const response = await requestJevCategory(request, apiKey);
      await this.tokenUsage.logUsage({
        userId: params.userId,
        operation: LLM_OP_CATEGORISE_SUMMARY,
        provider: JEV.PROVIDER,
        model: response.model,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        durationMs: Date.now() - startedAt,
      });
      const answer = response.answers[JEV.QUESTION_ID];
      const isAccepted = answer.confidence >= JEV.MIN_ACCEPTED_CONFIDENCE;
      this.logConfidence(answer, params.categories.length, isAccepted);
      const categoryNumber = Number(answer.choice);
      const categoryName = categoryNameForChoice(answer.choice, params);
      if (!isAccepted) {
        if (categoryName)
          onDeclined?.({ categoryName, confidence: answer.confidence });
        return null;
      }
      if (!categoryName) throw new Error("Jev chose an unknown category");
      return {
        categoryNumber,
        categoryName,
        categoryConfidence: "HIGH",
        reasoning: `Jev selected "${categoryName}" (choice confidence ${Math.round(answer.confidence * PERCENTAGES.ONE_HUNDRED)}%).`,
      };
    } catch {
      // Vendor errors may contain email data; keep fallback logs content-free.
      this.logger.warn(
        "Jev categorisation unavailable; falling back to Gemini",
      );
      return null;
    }
  }

  private logConfidence(
    answer: JevCategoryAnswer,
    categoryCount: number,
    isAccepted: boolean,
  ): void {
    logJevConfidence(this.logger, {
      decision: LLM_OP_CATEGORISE_SUMMARY,
      outcome: isAccepted
        ? JEV_OUTCOMES.ACCEPTED
        : JEV_OUTCOMES.BELOW_THRESHOLD,
      confidence: answer.confidence,
      threshold: JEV.MIN_ACCEPTED_CONFIDENCE,
      // The listed categories plus Other.
      optionCount: categoryCount + 1,
      choseNoneOption: answer.choice === JEV.OTHER_OPTION,
      runnerUpMargin: runnerUpMargin(answer.probabilities ?? {}),
    });
  }
}

/** The category a Jev choice names; null when the choice is outside the list. */
function categoryNameForChoice(
  choice: string,
  params: CategoriseFromSummaryParams,
): string | null {
  if (choice === JEV.OTHER_OPTION) return JEV.OTHER_CATEGORY;
  return params.categories[Number(choice) - 1]?.name ?? null;
}
