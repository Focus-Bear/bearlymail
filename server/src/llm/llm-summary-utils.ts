/**
 * LLM summary utilities shared across summarization services.
 * Extracted from LLMService (Phase 7a, issue #939).
 */

/**
 * Sanitises a summary value that may contain raw JSON.
 *
 * When a user's custom summarisation rule instructs the LLM to return structured
 * JSON, the raw JSON blob can leak into the TL;DR display (issue #1156).
 * This helper detects that case and extracts a human-readable string instead.
 *
 * - If the value is valid JSON, extract known text fields (summary, title,
 *   description, body) in preference order, or fall back to "key: value" pairs.
 * - If JSON.parse fails, return the string unchanged.
 */
export function extractPlainSummary(value: string): string {
  const trimmed = value.trim();
  // Quick bail-out: must start with { or [ to even attempt JSON parse
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object") {
      return trimmed;
    }
    if (Array.isArray(parsed)) {
      // Array of strings → join; array of objects → recursively extract each item
      const items = parsed
        .map((item: unknown) => {
          if (typeof item === "string") {
            return item;
          }
          if (typeof item === "object" && item !== null) {
            return extractPlainSummary(JSON.stringify(item));
          }
          return String(item);
        })
        .filter(Boolean);
      return items.join("\n") || trimmed;
    }
    const parsedObj = parsed as Record<string, unknown>;
    // Prefer well-known text fields in priority order
    for (const fieldName of ["summary", "title", "description", "body"]) {
      if (
        typeof parsedObj[fieldName] === "string" &&
        (parsedObj[fieldName] as string).trim()
      ) {
        return (parsedObj[fieldName] as string).trim();
      }
    }
    // Fall back: stringify each key-value pair on its own line (skip blank strings)
    const pairs = Object.entries(parsedObj)
      .filter(([, fieldValue]) => {
        if (typeof fieldValue === "string") return fieldValue.trim().length > 0;
        return (
          typeof fieldValue === "number" || typeof fieldValue === "boolean"
        );
      })
      .map(([fieldKey, fieldValue]) => `${fieldKey}: ${String(fieldValue)}`);
    return pairs.length > 0 ? pairs.join("\n") : trimmed;
  } catch {
    return trimmed;
  }
}
