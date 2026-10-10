import { ConfigService } from "@nestjs/config";

import {
  STRONG_GEMINI_MODEL,
  STRONG_GEMINI_MODEL_ENV_VAR,
} from "../constants/llm-constants";

/**
 * Resolves the strong Gemini model used for high-stakes judgement calls,
 * honouring the `GEMINI_STRONG_MODEL` env override. Shared so every strong-model
 * call site (proto-category dedup, auto-rule sanity review) picks the same model.
 */
export function resolveStrongGeminiModel(configService: ConfigService): string {
  return (
    configService.get<string>(STRONG_GEMINI_MODEL_ENV_VAR) ||
    STRONG_GEMINI_MODEL
  );
}
