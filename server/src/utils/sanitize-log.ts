/**
 * Neutralise CR/LF and other control characters in a value before it is written
 * to a log line. Prevents log-injection / log-forging (CWE-117), where attacker
 * controlled newlines could split one log entry into several forged ones.
 *
 * Lives in its own module (rather than logger.ts) so it can be reused by the
 * error-tracking helpers without creating a circular import with logger.ts.
 */

// Line-splitting / control characters, collapsed to a single space before
// logging: C0 controls (incl. CR, LF, TAB, NUL), DEL, the C1 control block
// (U+0080-U+009F), and the Unicode line/paragraph separators (U+2028/U+2029)
// that some log collectors also treat as line breaks. Built via the RegExp
// constructor so the source contains no raw control characters.
const LOG_INJECTION_CHARS = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+",
  "g",
);

export function sanitizeLogInput(value: unknown): string {
  return String(value).replace(LOG_INJECTION_CHARS, " ");
}
