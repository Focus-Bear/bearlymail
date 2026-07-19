/**
 * USD prices per million tokens for the LLM models we call, used to turn raw
 * token counts into cost estimates on the admin Token Usage dashboard.
 *
 * Matching is by provider + longest model-name prefix, so dated/versioned
 * model ids ("gemini-3.1-flash-lite-preview-05-20", "amazon.nova-micro-v1:0")
 * resolve to their base entry. Order within a provider does not matter — the
 * longest matching prefix wins (so "gemini-3.1-flash" never swallows
 * "gemini-3.1-flash-lite").
 *
 * Prices are list on-demand rates (no caching/batch discounts), so estimates
 * are an upper bound. Update when providers reprice; unknown models return
 * null rather than a wrong number.
 *
 * Sources (July 2026): ai.google.dev/gemini-api/docs/pricing,
 * developers.openai.com/api/docs/pricing, aws.amazon.com/nova/pricing,
 * anthropic.com/pricing.
 */
export interface ModelPricing {
  /** USD per 1M prompt (input) tokens. */
  inputPerMillion: number;
  /** USD per 1M completion (output) tokens; thinking tokens bill as output. */
  outputPerMillion: number;
}

const TOKENS_PER_MILLION = 1_000_000;

/** provider (lowercase) → model-name prefix → price. */
export const LLM_MODEL_PRICING: Record<string, Record<string, ModelPricing>> = {
  gemini: {
    "gemini-3.1-flash-lite": { inputPerMillion: 0.25, outputPerMillion: 1.5 },
    "gemini-3.1-flash": { inputPerMillion: 0.5, outputPerMillion: 3.0 },
    "gemini-3-flash": { inputPerMillion: 0.5, outputPerMillion: 3.0 },
    "gemini-3.5-flash": { inputPerMillion: 1.5, outputPerMillion: 9.0 },
  },
  openai: {
    "gpt-5.4-mini": { inputPerMillion: 0.75, outputPerMillion: 4.5 },
    "gpt-5.4": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  },
  bedrock: {
    "amazon.nova-micro": { inputPerMillion: 0.035, outputPerMillion: 0.14 },
    "amazon.nova-lite": { inputPerMillion: 0.06, outputPerMillion: 0.24 },
  },
  anthropic: {
    "claude-sonnet-4": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    "claude-haiku-4": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  },
  // The locally installed Claude Code CLI has no per-token API charge.
  "claude-cli": {
    "": { inputPerMillion: 0, outputPerMillion: 0 },
  },
};

/**
 * Estimated USD cost of a call (or an aggregate of calls) for a given
 * provider/model. Returns null when the model has no pricing entry, so the UI
 * can show "unknown" instead of silently under-counting.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const providerPricing = LLM_MODEL_PRICING[provider?.toLowerCase() ?? ""];
  if (!providerPricing) {
    return null;
  }
  const prefixes = Object.keys(providerPricing)
    .filter((prefix) => (model ?? "").startsWith(prefix))
    .sort((first, second) => second.length - first.length);
  if (prefixes.length === 0) {
    return null;
  }
  const pricing = providerPricing[prefixes[0]];
  return (
    (promptTokens * pricing.inputPerMillion) / TOKENS_PER_MILLION +
    (completionTokens * pricing.outputPerMillion) / TOKENS_PER_MILLION
  );
}
