import { GenerateContentConfig, Schema } from "@google/genai";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { LLMRequest } from "./llm.types";

/**
 * Builds the Gemini `GenerateContentConfig` for a request.
 *
 * The static system prompt is passed as `systemInstruction` (a stable,
 * identical-per-call prefix) rather than concatenated into the user message, so
 * Gemini's implicit context caching can reuse it across calls. `responseSchema`
 * (structured output / constrained decoding) forces the output to match the
 * schema — stronger than `responseMimeType` alone, so thinking models can't leak
 * chain-of-thought into the JSON body. A `thinkingBudget` of -1 lets the model
 * decide how much to think (dynamic).
 */
export function buildGeminiGenerationConfig(
  request: LLMRequest,
): GenerateContentConfig {
  return {
    temperature: request.temperature || RATIOS.SEVENTY_PERCENT,
    maxOutputTokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
    ...(request.systemPrompt
      ? { systemInstruction: request.systemPrompt }
      : {}),
    ...(request.jsonMode && { responseMimeType: "application/json" }),
    ...(request.responseSchema && {
      responseSchema: request.responseSchema as Schema,
    }),
    ...(request.thinking && { thinkingConfig: { thinkingBudget: -1 } }),
  };
}
