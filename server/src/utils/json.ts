import { Logger } from "@nestjs/common";

import { QUERY_LIMITS } from "../constants/query-limits";

const logger = new Logger("safeJsonParse");

/**
 * Parse a JSON string without throwing.
 *
 * On parse failure the \`fallback\` value is returned and a warning is logged
 * if a \`label\` is provided.  This lets call sites stay on the happy path
 * while still surfacing errors to logs.
 *
 * @param jsonStr  The string to parse.
 * @param fallback Value to return when parsing fails.
 * @param label    Optional context label included in the warning log.
 *
 * @example
 * // Returns null and logs a warning if the LLM response is truncated
 * const data = safeJsonParse<MyType>(llmResponse, null, "suggest_actions");
 */
export function safeJsonParse<T>(
  jsonStr: string,
  fallback: T,
  label?: string,
): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    if (label) {
      logger.warn(
        `Failed to parse JSON (${label}): ${err instanceof Error ? err.message : String(err)} — snippet: ${jsonStr.slice(0, QUERY_LIMITS.SUBSTRING_EXPLANATION_MAX)}`,
      );
    }
    return fallback;
  }
}

/**
 * Quick sanity-check that a string looks like a complete JSON object or array.
 *
 * This is a lightweight pre-filter (first/last character check) — it does
 * **not** guarantee the JSON is fully balanced, but it catches the most common
 * LLM truncation pattern where the model stops mid-response.
 *
 * The real guard against malformed JSON is still the try-catch inside
 * \`safeJsonParse\`.
 */
export function isLikelyCompleteJson(input: string): boolean {
  const trimmed = input.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}
