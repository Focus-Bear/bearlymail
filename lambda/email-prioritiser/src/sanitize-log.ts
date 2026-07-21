/**
 * Neutralise CR/LF and other control characters before a value is written to a
 * log line. LLM SDK errors can echo user-controlled email content containing
 * newlines, so sanitizing prevents log-injection / log-forging (CWE-117).
 */

// Line-splitting / control characters, collapsed to a single space before
// logging: C0 controls (incl. CR, LF, TAB, NUL), DEL, the C1 control block
// (U+0080-U+009F), and the Unicode line/paragraph separators (U+2028/U+2029).
// Built via the RegExp constructor so the source contains no raw control chars.
const LOG_INJECTION_CHARS = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+",
  "g",
);

export function sanitizeLogInput(value: unknown): string {
  return String(value).replace(LOG_INJECTION_CHARS, " ");
}
