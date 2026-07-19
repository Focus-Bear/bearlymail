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
 * Conservatively normalises a category display name for DUPLICATE DETECTION
 * only (never for display or storage). It strips emoji, lowercases, and
 * collapses runs of punctuation/whitespace, so names that are genuinely the
 * same modulo emoji/casing/spacing collapse to one key:
 *
 *   "🚀 App Store Notifications"  → "app store notifications"
 *   "📱 App Store Notifications"  → "app store notifications"
 *
 * It deliberately does NOT drop a trailing ":"/"-" descriptive clause: a name
 * like "Media & Communications: Podcast invitations" keeps the clause (→
 * "media & communications podcast invitations") so it does NOT collapse into a
 * bare "Media & Communications". Whether those are the same category is a
 * judgement call left to the LLM semantic pass, not the risk-free exact-name
 * pass. Returns "" for names that are only emoji/punctuation — callers should
 * treat an empty key as "no safe match" and skip it.
 */
export function normalizeCategoryNameForDedup(name: string): string {
  return name
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[^\p{Letter}\p{Number}&]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
  // Emoji/punctuation-insensitive exact match: the LLM frequently drops or
  // swaps the leading emoji (e.g. returns "CI/CD & QA Pipeline Failures" for the
  // stored "❌ CI/CD & QA Pipeline Failures"), which the case-only checks above
  // miss — so the name falls through to proto-fuzzy and gets mis-routed. Match
  // on the dedup-normalised key, but ONLY when exactly one known category
  // normalises to it; ambiguous keys are left for the LLM/proto path rather than
  // guessed. Replaces an earlier prefix-superset rule that snapped any shorter
  // GitHub name onto the LONGEST sibling ("New GitHub issues (bot-created)"),
  // turning that category into a catch-all sink (issue: bot-created mis-routing).
  const rawKey = normalizeCategoryNameForDedup(rawName);
  if (rawKey) {
    const normMatches = knownNames.filter(
      (knownName) => normalizeCategoryNameForDedup(knownName) === rawKey,
    );
    if (normMatches.length === 1) return normMatches[0];
  }
  return rawName;
}
