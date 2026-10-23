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

export class JevCategoryClient {
  constructor(
    private readonly getConfig: (key: string) => string | undefined,
    private readonly logger: Pick<Logger, "warn" | "log">,
    private readonly tokenUsage: Pick<TokenUsageService, "logUsage">,
  ) {}

  async categorise(
    params: CategoriseFromSummaryParams,
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
      if (!isAccepted) return null;
      const categoryNumber = Number(answer.choice);
      const categoryName =
        answer.choice === JEV.OTHER_OPTION
          ? JEV.OTHER_CATEGORY
          : params.categories[categoryNumber - 1].name;
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
