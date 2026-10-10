import type { Logger } from "@nestjs/common";

import { getErrorMessage } from "../types/common";
import { LLMProvider } from "./llm.types";

/**
 * Cheap-first routing for utility prompts: run on **Nova Micro (Bedrock)** —
 * ~7x cheaper on input and ~11x on output than Gemini flash-lite — and only
 * re-run on **Gemini** when the primary call failed, returned something the
 * caller could not use, or produced a result the caller's own predicate
 * judges too weak to act on. Mirrors `categoriseWithEscalation`, but generic
 * so the category-rule prompts (suggest / derive exclusions / assess value)
 * share one implementation.
 */
export const NOVA_ESCALATION_PRIMARY_PROVIDER = LLMProvider.BEDROCK;
export const NOVA_ESCALATION_FALLBACK_PROVIDER = LLMProvider.GEMINI;

/** The plain text request every rule prompt sends; the operation is added by the service. */
export interface RuleLlmTextRequest {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  userId?: string;
}

/** Generates raw LLM text on an explicit provider. Supplied by the service. */
export type ProviderRoutedGenerateText = (
  request: RuleLlmTextRequest,
  provider: LLMProvider,
) => Promise<string>;

export interface NovaEscalationParams<T> {
  /** Log prefix, e.g. "[SUGGEST-CATEGORY-RULES]". */
  label: string;
  logger: Pick<Logger, "log" | "warn">;
  /**
   * Runs the operation on `provider`. Return `null` when the call failed or
   * its response was unparseable — that alone triggers escalation.
   */
  run: (provider: LLMProvider) => Promise<T | null>;
  /** Extra trigger for a parsed-but-weak primary result (e.g. an empty rule set). */
  needsEscalation?: (result: T) => boolean;
}

type EscalationReason = "failed" | "weak";

async function runSafely<T>(
  params: NovaEscalationParams<T>,
  provider: LLMProvider,
): Promise<T | null> {
  try {
    return await params.run(provider);
  } catch (error) {
    params.logger.warn(
      `${params.label} ${provider} attempt threw: ${getErrorMessage(error)}`,
    );
    return null;
  }
}

function resolveEscalationReason<T>(
  primary: T | null,
  needsEscalation: NovaEscalationParams<T>["needsEscalation"],
): EscalationReason | null {
  if (primary === null) {
    return "failed";
  }
  return needsEscalation?.(primary) ? "weak" : null;
}

/**
 * Returns the Nova result when it is usable, otherwise the Gemini result;
 * falls back to whatever Nova produced (possibly `null`) when Gemini fails
 * too, so callers keep their existing "null = give up" handling.
 */
export async function runWithNovaEscalation<T>(
  params: NovaEscalationParams<T>,
): Promise<T | null> {
  const primary = await runSafely(params, NOVA_ESCALATION_PRIMARY_PROVIDER);
  const reason = resolveEscalationReason(primary, params.needsEscalation);
  if (reason === null) {
    return primary;
  }

  const escalated = await runSafely(params, NOVA_ESCALATION_FALLBACK_PROVIDER);
  if (escalated === null) {
    return primary;
  }
  params.logger.log(
    `${params.label} escalated to ${NOVA_ESCALATION_FALLBACK_PROVIDER} (${NOVA_ESCALATION_PRIMARY_PROVIDER} ${reason})`,
  );
  return escalated;
}
