import type { Logger } from "@nestjs/common";

import { JEV, JEV_DECISIONS } from "../../constants/jev.constants";
import { ENV_BOOLEAN_STRING } from "../../constants/service-constants";
import type { JevQuestion, JevResponse } from "../jev-system-one";
import { requestJev } from "../jev-system-one";
import type { LLMRequest } from "../llm.types";
import { LLM_OP_UNKNOWN } from "../llm-operations";
import type { TokenUsageService } from "../token-usage.service";
import { jevAnswerConfidence } from "./jev-answer.helpers";
import { JEV_DECISION_REGISTRY } from "./jev-decision.registry";
import type {
  JevDecisionDefinition,
  JevDecisionOutcome,
  JevDecisionRequest,
} from "./jev-decision.types";

/**
 * The policy and input go in state once; repeating them in every question
 * multiplies input tokens by the question count.
 */
export function buildDecisionState(
  request: Pick<LLMRequest, "prompt" | "systemPrompt">,
) {
  return {
    note: JEV_DECISIONS.POLICY_NOTE,
    policyAndInput: [request.systemPrompt, request.prompt]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function withPolicyReference(
  questions: Record<string, JevQuestion>,
): Record<string, JevQuestion> {
  return Object.fromEntries(
    Object.entries(questions).map(([key, question]) => [
      key,
      {
        ...question,
        instructions: `${question.instructions}\n${JEV_DECISIONS.POLICY_REFERENCE}`,
      },
    ]),
  );
}

/**
 * Tries Jev before an LLM request that carries a `jevDecision`. Returns the
 * JSON text the caller already parses when Jev is confident and no generated
 * text is needed; otherwise null, and the original LLM call runs unchanged.
 */
export class JevDecisionClient {
  constructor(
    private readonly getConfig: (key: string) => string | undefined,
    private readonly logger: Pick<Logger, "warn">,
    private readonly tokenUsage: Pick<TokenUsageService, "logUsage">,
  ) {}

  async decide(request: LLMRequest, userId?: string): Promise<string | null> {
    const decision = request.jevDecision;
    const apiKey = this.getConfig(JEV.API_KEY_ENV);
    if (
      !decision ||
      !apiKey ||
      this.getConfig(JEV_DECISIONS.ENABLED_ENV) === ENV_BOOLEAN_STRING.FALSE
    )
      return null;
    try {
      const definition = this.definitionFor(decision);
      const response = await this.ask(
        request,
        definition.questions(decision.input),
        apiKey,
        userId,
      );
      const outcome = definition.compose(decision.input, response.answers);
      return this.isAccepted(outcome, response, definition.minConfidence)
        ? JSON.stringify(outcome.output)
        : null;
    } catch {
      // Vendor errors may contain email data; keep fallback logs content-free.
      this.logger.warn(
        `Jev ${decision.kind} decision unavailable; using the LLM fallback`,
      );
      return null;
    }
  }

  // The registry is keyed by kind, so the definition always matches its input.
  private definitionFor(
    decision: JevDecisionRequest,
  ): JevDecisionDefinition<JevDecisionRequest["input"]> {
    return JEV_DECISION_REGISTRY[decision.kind] as JevDecisionDefinition<
      JevDecisionRequest["input"]
    >;
  }

  private async ask(
    request: LLMRequest,
    questions: Record<string, JevQuestion>,
    apiKey: string,
    userId?: string,
  ): Promise<JevResponse> {
    const startedAt = Date.now();
    const response = await requestJev(
      {
        state: buildDecisionState(request),
        model: this.getConfig(JEV.MODEL_ENV) || JEV.DEFAULT_MODEL,
        questions: withPolicyReference(questions),
      },
      apiKey,
    );
    await this.tokenUsage.logUsage({
      userId: userId || request.userId,
      operation: request.operation || LLM_OP_UNKNOWN,
      provider: JEV.PROVIDER,
      model: response.model,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }

  private isAccepted(
    outcome: JevDecisionOutcome,
    response: JevResponse,
    minConfidence: number,
  ): boolean {
    return (
      !outcome.generationRequired &&
      outcome.usedKeys.every(
        (key) => jevAnswerConfidence(response.answers[key]) >= minConfidence,
      )
    );
  }
}
