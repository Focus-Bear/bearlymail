import { JEV_DECISION_PROVIDER } from "../../constants/ai-decision-provider.constants";
import { JEV, JEV_DECISIONS } from "../../constants/jev.constants";
import { ENV_BOOLEAN_STRING } from "../../constants/service-constants";
import type {
  LoggerPort,
  TokenUsageSink,
} from "../../shared/email-intelligence/ports";
import {
  JEV_OUTCOMES,
  type JevOutcome,
  logJevConfidence,
} from "../jev-confidence-log";
import type { JevQuestion, JevResponse } from "../jev-system-one";
import { requestJev } from "../jev-system-one";
import type { LLMRequest } from "../llm.types";
import { LLM_OP_UNKNOWN } from "../llm-operations";
import { reportProvider } from "../provider-report.util";
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

type ConfigReader = (key: string) => string | undefined;

/**
 * True when typed Jev decisions can run: the TypeSafe key is configured and
 * the `JEV_DECISIONS_ENABLED` kill switch is not off.
 */
export function isJevDecisionsAvailable(getConfig: ConfigReader): boolean {
  return (
    !!getConfig(JEV.API_KEY_ENV) &&
    getConfig(JEV_DECISIONS.ENABLED_ENV) !== ENV_BOOLEAN_STRING.FALSE
  );
}

/**
 * Tries Jev before an LLM request that carries a `jevDecision`. Returns the
 * JSON text the caller already parses when Jev is confident and no generated
 * text is needed; otherwise null, and the original LLM call runs unchanged.
 */
export class JevDecisionClient {
  constructor(
    private readonly getConfig: ConfigReader,
    private readonly logger: Pick<LoggerPort, "warn" | "log">,
    private readonly tokenUsage: TokenUsageSink,
  ) {}

  async decide(request: LLMRequest, userId?: string): Promise<string | null> {
    const decision = request.jevDecision;
    const apiKey = this.getConfig(JEV.API_KEY_ENV);
    if (!decision || !apiKey || !isJevDecisionsAvailable(this.getConfig))
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
      const verdict = this.judge(outcome, response, definition.minConfidence);
      logJevConfidence(this.logger, {
        decision: decision.kind,
        outcome: verdict.outcome,
        confidence: verdict.confidence,
        threshold: definition.minConfidence,
      });
      if (verdict.outcome !== JEV_OUTCOMES.ACCEPTED) {
        return null;
      }
      const output = JSON.stringify(outcome.output);
      return reportProvider(request, JEV_DECISION_PROVIDER, output);
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

  /** The weakest answer the decision relied on decides whether Jev's result is trusted. */
  private judge(
    outcome: JevDecisionOutcome,
    response: JevResponse,
    minConfidence: number,
  ): { outcome: JevOutcome; confidence: number | null } {
    const confidences = outcome.usedKeys.map((key) =>
      jevAnswerConfidence(response.answers[key]),
    );
    const confidence = confidences.length ? Math.min(...confidences) : null;
    if (outcome.generationRequired)
      return { outcome: JEV_OUTCOMES.NEEDS_GENERATION, confidence };
    if (confidence !== null && confidence < minConfidence)
      return { outcome: JEV_OUTCOMES.BELOW_THRESHOLD, confidence };
    return { outcome: JEV_OUTCOMES.ACCEPTED, confidence };
  }
}
