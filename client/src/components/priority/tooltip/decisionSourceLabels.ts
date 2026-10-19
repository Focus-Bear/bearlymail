import { AiDecisionProvider, CategorizationSource, PriorityScoreSource } from 'types/email';

/**
 * i18n keys naming the engine behind an AI decision, e.g. "LLM (Gemini)" or
 * "TypeSafe AI (Jev)", so the popover never hides which model decided.
 */
export const AI_PROVIDER_LABEL_KEYS: Record<AiDecisionProvider, string> = {
  openai: 'priority.tooltip.aiProvider.openai',
  gemini: 'priority.tooltip.aiProvider.gemini',
  bedrock: 'priority.tooltip.aiProvider.bedrock',
  anthropic: 'priority.tooltip.aiProvider.anthropic',
  'claude-cli': 'priority.tooltip.aiProvider.claudeCli',
  jev: 'priority.tooltip.aiProvider.jev',
};

/** Shown for AI decisions made before the server recorded which engine decided. */
export const UNKNOWN_AI_PROVIDER_LABEL_KEY = 'priority.tooltip.aiProvider.unknown';

const AI_CATEGORISATION_SOURCE = 'ai' satisfies CategorizationSource;
const LLM_PRIORITY_SOURCE = 'llm' satisfies PriorityScoreSource;

/** Non-AI "Categorised by" labels; AI picks name their engine instead. */
const CATEGORISATION_SOURCE_LABEL_KEYS: Record<Exclude<CategorizationSource, typeof AI_CATEGORISATION_SOURCE>, string> = {
  rule: 'priority.tooltip.categorisedBy.rule',
  local: 'priority.tooltip.categorisedBy.local',
  proto: 'priority.tooltip.categorisedBy.proto',
  user: 'priority.tooltip.categorisedBy.user',
};

/** Non-AI "Priority scored by" labels; LLM scores name their engine instead. */
const PRIORITY_SOURCE_LABEL_KEYS: Record<Exclude<PriorityScoreSource, typeof LLM_PRIORITY_SOURCE>, string> = {
  rule: 'priority.tooltip.scoredBy.rule',
  local: 'priority.tooltip.scoredBy.local',
};

export function getAiProviderLabelKey(provider: AiDecisionProvider | null | undefined): string {
  return (provider && AI_PROVIDER_LABEL_KEYS[provider]) || UNKNOWN_AI_PROVIDER_LABEL_KEY;
}

export function getCategorisationSourceLabelKey(
  source: CategorizationSource,
  provider: AiDecisionProvider | null | undefined
): string {
  if (source === AI_CATEGORISATION_SOURCE) {
    return getAiProviderLabelKey(provider);
  }
  return CATEGORISATION_SOURCE_LABEL_KEYS[source];
}

export function getPrioritySourceLabelKey(
  source: PriorityScoreSource,
  provider: AiDecisionProvider | null | undefined
): string {
  if (source === LLM_PRIORITY_SOURCE) {
    return getAiProviderLabelKey(provider);
  }
  return PRIORITY_SOURCE_LABEL_KEYS[source];
}
