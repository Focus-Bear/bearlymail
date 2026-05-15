/**
 * Deterministic email-pattern matching helpers.
 *
 * Supported pattern formats:
 *  - `/regex/flags`  — JavaScript RegExp literal (delimited by `/`)
 *  - `*@domain.com`  — glob (only `*` is supported as a wildcard prefix)
 *  - `plain text`    — case-insensitive substring match
 */

const REGEX_PATTERN = /^\/(.+)\/([gimsuy]*)$/;

/**
 * Convert a glob pattern to a RegExp.
 * Only `*` wildcards are supported (matches any sequence of characters).
 *
 * Example: "*@github.com" → /^.*@github\.com$/i
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  // nosemgrep
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Returns true when `value` matches `pattern`.
 *
 * Pattern resolution order:
 * 1. `/regex/flags` — compiled and tested as-is.
 * 2. Glob containing `*` — converted to an anchored regexp.
 * 3. Plain string — case-insensitive substring search.
 *
 * Invalid regex literals are treated as plain-string patterns to avoid
 * throwing at runtime.
 */
export function matchPattern(value: string, pattern: string): boolean {
  const trimmed = pattern.trim();

  const regexMatch = REGEX_PATTERN.exec(trimmed);
  if (regexMatch) {
    try {
      // nosemgrep
      const re = new RegExp(regexMatch[1], regexMatch[2]);
      return re.test(value);
    } catch {
      // Fall through to substring match when the regex literal is malformed.
    }
  }

  if (trimmed.includes("*")) {
    return globToRegExp(trimmed).test(value);
  }

  return value.toLowerCase().includes(trimmed.toLowerCase());
}

/**
 * Returns true when `value` matches **any** pattern in the array.
 * An empty array is treated as "no constraint" — it always returns true.
 */
export function matchAny(value: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => matchPattern(value, pattern));
}

/**
 * Validate that a pattern is syntactically legal.
 * Returns null on success, or an error message on failure.
 *
 * Use this at the API layer when saving rules so users get immediate feedback
 * rather than silent breakage at match time.
 */
export function validatePattern(pattern: string): string | null {
  const trimmed = pattern.trim();
  const regexMatch = REGEX_PATTERN.exec(trimmed);
  if (regexMatch) {
    try {
      new RegExp(regexMatch[1], regexMatch[2]);
      return null;
    } catch (err) {
      return `Invalid regex pattern "${trimmed}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  // Glob and plain-string patterns are always syntactically valid.
  return null;
}

/**
 * Validate a list of patterns and return all error messages (if any).
 * Returns an empty array when all patterns are valid.
 */
export function validatePatterns(patterns: string[]): string[] {
  return patterns
    .map(validatePattern)
    .filter((error): error is string => error !== null);
}
