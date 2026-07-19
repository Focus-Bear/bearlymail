/**
 * Tolerant decoding of the `emails.labels` / `scan_emails.labels` value.
 *
 * Canonically, labels are stored as `encrypt(JSON.stringify(string[]))`, so the
 * post-decrypt value is a JSON array (`["INBOX","IMPORTANT"]`).
 *
 * Some rows, however, were written via `repository.update()` (which bypasses
 * the TypeORM column transformer — see EmailCrudService.updateEmail). node-pg
 * then serialised the JS array into a **PostgreSQL text[] array literal**
 * (`{"INBOX","IMPORTANT"}` or `{INBOX,IMPORTANT}`) stored as plaintext. Those
 * values are not valid JSON, so `JSON.parse` throws — which is the source of
 * the high-volume `Failed to decrypt/parse labels` log spam on every inbox
 * load. This helper reads both shapes so the inbox renders correctly and stops
 * logging per-row.
 *
 * NOTE: this is the read-side safety net. The companion write fix removes the
 * remaining `repository.update({ labels })` bypass that produced these literals
 * in the first place, and the re-encryption job repairs the legacy rows.
 */

interface ElementParse {
  /** The decoded element value. */
  value: string;
  /** The index of the character *after* the element (typically a `,` or end). */
  nextIndex: number;
}

/** Read a quoted element from a Postgres array literal. Caller positions `start` at the opening `"`. */
function readQuotedElement(inner: string, start: number): ElementParse {
  let index = start + 1;
  let value = "";
  while (index < inner.length) {
    const char = inner[index];
    if (char === "\\" && index + 1 < inner.length) {
      value += inner[index + 1];
      index += 2;
      continue;
    }
    if (char === '"') {
      return { value, nextIndex: index + 1 };
    }
    value += char;
    index += 1;
  }
  return { value, nextIndex: index };
}

/** Read an unquoted element (up to the next comma or end). */
function readUnquotedElement(inner: string, start: number): ElementParse {
  let index = start;
  let value = "";
  while (index < inner.length && inner[index] !== ",") {
    value += inner[index];
    index += 1;
  }
  return { value: value.trim(), nextIndex: index };
}

/**
 * Parse a PostgreSQL text[] array literal (`{...}`) into a string array.
 * Handles quoted elements (`{"a","b"}`, with `\"` / `\\` escapes) and unquoted
 * elements (`{a,b}`). Returns null if the input is not a `{...}` literal.
 */
export function parsePostgresTextArray(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  const inner = trimmed.slice(1, -1);
  if (inner.trim() === "") return [];

  const result: string[] = [];
  let index = 0;
  while (index < inner.length) {
    // Skip whitespace between elements.
    while (index < inner.length && inner[index] === " ") index += 1;
    if (index >= inner.length) break;

    const parsed =
      inner[index] === '"'
        ? readQuotedElement(inner, index)
        : readUnquotedElement(inner, index);
    result.push(parsed.value);
    index = parsed.nextIndex;

    // Skip up to and past the next comma.
    while (index < inner.length && inner[index] !== ",") index += 1;
    if (inner[index] === ",") index += 1;
  }
  return result;
}

/**
 * Decode a (already-decrypted or passed-through) labels value into a string[].
 * Accepts the canonical JSON-array form and the legacy Postgres array-literal
 * form. Returns null when the value is neither (caller decides the fallback).
 */
export function parseLabelsValue(value: string): string[] | null {
  const trimmed = value.trim();
  if (trimmed === "") return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      /* not valid JSON despite the leading "[" — fall through to null */
    }
    return null;
  }

  if (trimmed.startsWith("{")) {
    return parsePostgresTextArray(trimmed);
  }

  return null;
}
