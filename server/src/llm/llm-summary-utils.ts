/**
 * LLM summary utilities shared across summarization services.
 * Extracted from LLMService (Phase 7a, issue #1156 / summarisation hardening).
 */

/**
 * Strips ``` / ```json fences that models often add despite "no markdown" instructions.
 */
export function stripLlmJsonWrappers(raw: string): string {
  let text = raw.trim();
  if (!text.startsWith("```")) {
    return text;
  }
  text = text.replace(/^```(?:json)?\s*\r?\n?/i, "");
  const endFence = text.lastIndexOf("```");
  if (endFence !== -1) {
    text = text.slice(0, endFence);
  }
  return text.trim();
}

/**
 * Extracts the first `{ ... }` block with correct brace depth, respecting JSON string rules.
 * A greedy `/\{[\s\S]*\}/` breaks when a "summary" string contains `}` (issue: raw JSON in UI).
 */
export function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Parses a single JSON object from model output (fences, preamble, or trailing text).
 */
export function tryParseJsonObjectFromLlmResponse(
  raw: string,
): Record<string, unknown> | null {
  const candidates = [stripLlmJsonWrappers(raw.trim()), raw.trim()];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try balanced slice */
    }
    const balanced = extractFirstBalancedJsonObject(candidate);
    if (balanced && !seen.has(balanced)) {
      seen.add(balanced);
      try {
        const parsed: unknown = JSON.parse(balanced);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

/**
 * Normalises the LLM `summary` field when it is a string or a small nested object.
 */
export function coerceSummaryFromLlmField(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return extractPlainSummary(trimmed);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["summary", "text", "tldr", "body", "message"]) {
      const inner = record[key];
      if (typeof inner === "string" && inner.trim()) {
        return extractPlainSummary(inner.trim());
      }
    }
  }
  return null;
}

// Precompiled once (in preference order summary → title → description → body):
// each matches that field's JSON string value, tolerating escaped quotes
// inside the value (`(?:[^"\\]|\\.)*`).
const RECOVERY_FIELD_PATTERNS: readonly RegExp[] = [
  /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  /"body"\s*:\s*"((?:[^"\\]|\\.)*)"/,
];

/**
 * Recovers a known text field (summary/title/...) from a JSON-looking string
 * that `JSON.parse` rejects — typically because the model's response was
 * truncated at the token limit mid-object. Our summary prompts emit `summary`
 * as the first field, so it survives truncation even when the trailing
 * `sentiment` / `meetingProposal` fields are cut off. Without this, the whole
 * raw JSON blob leaks into the TL;DR display.
 */
export function recoverTextFieldFromBrokenJson(text: string): string | null {
  for (const pattern of RECOVERY_FIELD_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      try {
        // Models often emit literal newlines/tabs inside the string, which are
        // invalid in a raw JSON string literal — escape them so JSON.parse can
        // still unescape the surviving `\"`, `\\`, etc.
        const sanitized = match[1]
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
        const value: unknown = JSON.parse(`"${sanitized}"`);
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      } catch {
        /* malformed escape sequence — try the next field */
      }
    }
  }
  return null;
}

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
  let trimmed = stripLlmJsonWrappers(value.trim());

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const balanced = extractFirstBalancedJsonObject(trimmed);
    if (balanced) {
      try {
        JSON.parse(balanced);
        trimmed = balanced;
      } catch {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object") {
      return trimmed;
    }
    if (Array.isArray(parsed)) {
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
    for (const fieldName of ["summary", "title", "description", "body"]) {
      if (
        typeof parsedObj[fieldName] === "string" &&
        (parsedObj[fieldName] as string).trim()
      ) {
        return (parsedObj[fieldName] as string).trim();
      }
    }
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
    // Truncated / malformed JSON: salvage the summary field rather than
    // leaking the raw blob into the TL;DR.
    return recoverTextFieldFromBrokenJson(trimmed) ?? trimmed;
  }
}
