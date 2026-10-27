import {
  STRONG_GEMINI_MODEL,
  STRONG_GEMINI_MODEL_ENV_VAR,
} from "../constants/llm-constants";
import type { ConfigReader } from "../shared/email-intelligence/ports";

/**
 * Resolves the strong Gemini model used for high-stakes judgement calls,
 * honouring the `GEMINI_STRONG_MODEL` env override. Shared so every strong-model
 * call site (proto-category dedup, auto-rule sanity review) picks the same model.
 */
export function resolveStrongGeminiModel(getConfig: ConfigReader): string {
  return getConfig(STRONG_GEMINI_MODEL_ENV_VAR) || STRONG_GEMINI_MODEL;
}
