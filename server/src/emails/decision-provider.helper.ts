/**
 * Which AI engine made a thread's category / priority decision, for the
 * popover's "Categorised by: LLM (Gemini)" style lines. The stored provider is
 * only meaningful while the decision is still an AI one: once a rule, the
 * local model or the user takes over, the provider column may be stale, so it
 * is gated on the current source here rather than trusted on its own.
 */
import {
  AiDecisionProvider,
  toAiDecisionProvider,
} from "../constants/ai-decision-provider.constants";
import {
  PRIORITY_SCORE_SOURCE,
  PriorityScoreSource,
} from "../constants/priority-rule.constants";
import { CategorizationSourceKind } from "./category-source.helper";

const AI_CATEGORIZATION_SOURCE: CategorizationSourceKind = "ai";

/** Provider behind an AI-decided category; null for every other source. */
export function deriveCategorizationProvider(input: {
  categorizationSource: CategorizationSourceKind | null;
  categoryDecisionProvider: string | null | undefined;
}): AiDecisionProvider | null {
  if (input.categorizationSource !== AI_CATEGORIZATION_SOURCE) return null;
  return toAiDecisionProvider(input.categoryDecisionProvider);
}

/** Narrows the stored `prioritySource` column to a known value. */
export function toPriorityScoreSource(
  value: string | null | undefined,
): PriorityScoreSource | null {
  const known: readonly string[] = Object.values(PRIORITY_SCORE_SOURCE);
  return value && known.includes(value) ? (value as PriorityScoreSource) : null;
}

/** Provider behind an LLM-scored priority; null for rule/local/unknown scores. */
export function derivePriorityProvider(input: {
  prioritySource: string | null | undefined;
  priorityDecisionProvider: string | null | undefined;
}): AiDecisionProvider | null {
  if (input.prioritySource !== PRIORITY_SCORE_SOURCE.LLM) return null;
  return toAiDecisionProvider(input.priorityDecisionProvider);
}
