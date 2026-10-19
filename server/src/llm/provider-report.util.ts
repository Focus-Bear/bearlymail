import type { AiDecisionProvider } from "../constants/ai-decision-provider.constants";
import type { LLMRequest } from "./llm.types";

/**
 * Tells the caller which engine answered (see `LLMRequest.onProviderResolved`)
 * and passes the answer through. Each generator reports itself, so internal
 * hops — the Gemini billing circuit routing to OpenAI, the outer provider
 * fallback — name the engine that actually produced the text, not the one that
 * was requested.
 */
export function reportProvider(
  request: LLMRequest,
  provider: AiDecisionProvider,
  answer: string,
): string {
  request.onProviderResolved?.(provider);
  return answer;
}
