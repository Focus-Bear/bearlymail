import { LLMProvider } from "../llm/llm.types";

/**
 * TypeSafe AI's Jev answered the decision itself (no LLM call was made).
 * Distinct from every `LLMProvider`, which name the LLM vendor that answered.
 */
export const JEV_DECISION_PROVIDER = "jev";

/**
 * Which engine produced an AI decision (category pick, priority score): an LLM
 * vendor, or Jev. Recorded on the thread at decision time so the UI can say
 * "LLM (Gemini)" / "TypeSafe AI (Jev)" instead of a generic "AI" label. The
 * values are part of the API contract — never rename them.
 */
export type AiDecisionProvider = LLMProvider | typeof JEV_DECISION_PROVIDER;

const AI_DECISION_PROVIDERS: ReadonlySet<string> = new Set<string>([
  ...Object.values(LLMProvider),
  JEV_DECISION_PROVIDER,
]);

/**
 * Narrows a stored column value to a known provider; anything else (null,
 * legacy or unknown values) becomes null so the client shows its generic label.
 */
export function toAiDecisionProvider(
  value: string | null | undefined,
): AiDecisionProvider | null {
  return value && AI_DECISION_PROVIDERS.has(value)
    ? (value as AiDecisionProvider)
    : null;
}
