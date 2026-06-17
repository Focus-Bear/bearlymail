/**
 * Pure string-parsing helpers for the `UserContext.contextValue` format
 * `"Name - Description"`.
 *
 * These helpers MUST NOT import any database entity (or anything that
 * transitively imports one). `encryption.helper.ts` reaches into this module
 * during its own initialisation, so any entity import here would re-create the
 * cycle (encryption.helper → entity → encryption.helper) that left @Column
 * decorators with `transformer: undefined` and silently broke re-encryption
 * discovery (issue #1700).
 *
 * Entity-aware helpers live in `category-name.util.ts`, which re-exports these
 * pure functions for backwards compatibility.
 */

/**
 * Extracts the display name from a `"Name - Description"` context value.
 *
 * @example
 * parseCategoryName("PR Bot Comments - Auto-categorised PR notifications")
 * // → "PR Bot Comments"
 *
 * parseCategoryName("Simple Name")
 * // → "Simple Name"
 *
 * parseCategoryName("A - B - C")
 * // → "A"
 *
 * parseCategoryName("")
 * // → ""
 */
export function parseCategoryName(contextValue: string): string {
  return contextValue.split(" - ")[0].trim();
}

/**
 * Extracts the description portion from a `"Name - Description"` context value.
 * Returns `null` when no separator is present.
 *
 * When multiple separators exist (e.g., `"A - B - C"`), the description is
 * everything after the first separator (`"B - C"`), preserving the original
 * convention used across the codebase.
 *
 * @example
 * parseCategoryDescription("PR Bot Comments - Auto-categorised PR notifications")
 * // → "Auto-categorised PR notifications"
 *
 * parseCategoryDescription("Simple Name")
 * // → null
 *
 * parseCategoryDescription("A - B - C")
 * // → "B - C"
 */
export function parseCategoryDescription(contextValue: string): string | null {
  const parts = contextValue.split(" - ");
  if (parts.length <= 1) return null;
  return parts.slice(1).join(" - ").trim() || null;
}

/**
 * Parses a context value into a `{ name, description }` pair.
 * Useful when a call site needs both parts (e.g. building category lists for the LLM).
 */
export function parseCategoryValue(contextValue: string): {
  name: string;
  description: string | null;
} {
  return {
    name: parseCategoryName(contextValue),
    description: parseCategoryDescription(contextValue),
  };
}

/**
 * Maps a raw LLM-supplied category name onto the closest known category name,
 * so paraphrases/parenthetical variants/prefixes resolve back to the canonical
 * stored name. Returns `rawName` unchanged for `"Other"` or when nothing
 * matches. Pure string logic — no entity access.
 */
export function canonicaliseCategoryName(
  rawName: string,
  knownNames: string[],
): string {
  if (!rawName || rawName === "Other") return rawName;
  const exact = knownNames.find(
    (knownName) => knownName.toLowerCase() === rawName.toLowerCase(),
  );
  if (exact) return exact;
  const withoutParens = rawName
    .replace(/\s*\(.*\)\s*$/, "")
    .trim()
    .toLowerCase();
  const parenMatch = knownNames.find(
    (knownName) => knownName.toLowerCase() === withoutParens,
  );
  if (parenMatch) return parenMatch;
  const prefixCandidates = knownNames.filter(
    (knownName) =>
      rawName.toLowerCase().startsWith(knownName.toLowerCase()) ||
      knownName.toLowerCase().startsWith(rawName.toLowerCase()),
  );
  if (prefixCandidates.length > 0) {
    return prefixCandidates.reduce((longest, candidate) =>
      candidate.length > longest.length ? candidate : longest,
    );
  }
  return rawName;
}
