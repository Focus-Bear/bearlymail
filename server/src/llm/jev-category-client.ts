import { JEV, JEV_TWO_STAGE } from "../constants/jev.constants";
import { PERCENTAGES } from "../constants/percentages";
import { ENV_BOOLEAN_STRING } from "../constants/service-constants";
import type {
  LoggerPort,
  TokenUsageSink,
} from "../shared/email-intelligence/ports";
import { isTwoStageWorthwhile } from "./jev-category-families";
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
import {
  type FamilyConfidence,
  topFamilyConfidence,
} from "./jev-family-confidence";
import {
  type AskJev,
  categoriseInTwoStages,
  TWO_STAGE_OUTCOMES,
} from "./jev-two-stage-category";
import type {
  CategoriseFromSummaryParams,
  CategoriseFromSummaryResult,
} from "./llm-categorise-summary";
import { LLM_OP_CATEGORISE_SUMMARY } from "./llm-operations";
import { isAuthFailure, type JevCredentials } from "./user-ai-routing";

/** Jev's below-threshold pick, reported so agreement with the fallback can be measured. */
export interface JevDeclinedPick {
  /** Null when two-stage Jev declined at the family, before naming a category. */
  categoryName: string | null;
  confidence: number;
  /** Jev's most probable family; null when Jev returned no probabilities. */
  family: FamilyConfidence | null;
  /** Log label for the shadow record; defaults to single-stage categorisation. */
  decision?: string;
  /**
   * Two-stage only: Jev was sure of the family but not the category, so the
   * fallback may choose among just these categories.
   */
  narrowToCategoryNames?: string[];
}

export class JevCategoryClient {
  constructor(
    private readonly getConfig: (key: string) => string | undefined,
    private readonly logger: Pick<LoggerPort, "warn" | "log">,
    private readonly tokenUsage: TokenUsageSink,
  ) {}

  /**
   * `credentials` is the TypeSafe key this call may use (the user's own or
   * BearlyMail's — see selectJevCredentials); null skips Jev.
   */
  async categorise(
    params: CategoriseFromSummaryParams,
    credentials: JevCredentials | null,
    onDeclined?: (pick: JevDeclinedPick) => void,
  ): Promise<CategoriseFromSummaryResult | null> {
    if (
      !credentials ||
      this.getConfig(JEV.ENABLED_ENV) === ENV_BOOLEAN_STRING.FALSE ||
      !params.summary?.trim() ||
      !params.categories.length
    )
      return null;
    try {
      const model = this.getConfig(JEV.MODEL_ENV) || JEV.DEFAULT_MODEL;
      const askJev: AskJev = (request, questionId) =>
        this.askJev(request, questionId, credentials.apiKey, params.userId);
      if (this.isTwoStageEnabled() && isTwoStageWorthwhile(params.categories)) {
        const outcome = await categoriseInTwoStages({
          params,
          model,
          askJev,
          logger: this.logger,
        });
        if (outcome.kind === TWO_STAGE_OUTCOMES.ACCEPTED) return outcome.result;
        if (outcome.pick) onDeclined?.(outcome.pick);
        return null;
      }
      const answer = await askJev(
        buildJevCategoryRequest(params, model),
        JEV.QUESTION_ID,
      );
      const isAccepted = answer.confidence >= JEV.MIN_ACCEPTED_CONFIDENCE;
      const family = topFamilyConfidence(answer.probabilities ?? {}, (choice) =>
        categoryNameForChoice(choice, params),
      );
      this.logConfidence(answer, params.categories.length, isAccepted, family);
      const categoryNumber = Number(answer.choice);
      const categoryName = categoryNameForChoice(answer.choice, params);
      if (!isAccepted) {
        if (categoryName)
          onDeclined?.({ categoryName, confidence: answer.confidence, family });
        return null;
      }
      if (!categoryName) throw new Error("Jev chose an unknown category");
      return {
        categoryNumber,
        categoryName,
        categoryConfidence: "HIGH",
        reasoning: `Jev selected "${categoryName}" (choice confidence ${Math.round(answer.confidence * PERCENTAGES.ONE_HUNDRED)}%).`,
      };
    } catch (error) {
      if (isAuthFailure(error)) credentials.onRejected?.();
      // Vendor errors may contain email data; keep fallback logs content-free.
      this.logger.warn(
        "Jev categorisation unavailable; falling back to Gemini",
      );
      return null;
    }
  }

  private isTwoStageEnabled(): boolean {
    return (
      this.getConfig(JEV_TWO_STAGE.ENABLED_ENV) === ENV_BOOLEAN_STRING.TRUE
    );
  }

  /** One Jev Choice call, with its token usage logged under categorisation. */
  private async askJev(
    request: Parameters<AskJev>[0],
    questionId: string,
    apiKey: string,
    userId: string | undefined,
  ): Promise<JevCategoryAnswer> {
    const startedAt = Date.now();
    const response = await requestJevCategory(request, apiKey);
    await this.tokenUsage.logUsage({
      userId,
      operation: LLM_OP_CATEGORISE_SUMMARY,
      provider: JEV.PROVIDER,
      model: response.model,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      durationMs: Date.now() - startedAt,
    });
    const answer = response.answers[questionId];
    if (!answer) throw new Error("Jev returned no answer to the question");
    return answer;
  }

  private logConfidence(
    answer: JevCategoryAnswer,
    categoryCount: number,
    isAccepted: boolean,
    family: FamilyConfidence | null,
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
      familyConfidence: family?.confidence,
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
