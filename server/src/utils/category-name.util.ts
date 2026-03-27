/**
 * Utilities for parsing and resolving category names from the
 * `UserContext.contextValue` format: `"Name - Description"`.
 *
 * The format is a convention-encoded string where the first segment (before the
 * first ` - ` separator) is the display name, and the remainder is an optional
 * description.  This module centralises the parsing so that each of the 19+
 * former inline `.split(" - ")[0].trim()` call sites uses a single, tested
 * implementation.
 */

import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";

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
 * Resolves a category display name from a category ID by looking up the
 * matching `UserContext` record in an already-fetched context array.
 *
 * Returns `null` when:
 * - `categoryId` is `null` / `undefined`
 * - no matching `EMAIL_CATEGORY` context is found
 *
 * @param categoryId - The UUID stored on the email / thread record.
 * @param contexts   - Array of `UserContext` records already loaded for this user.
 */
export function resolveCategoryName(
  categoryId: string | null | undefined,
  contexts: UserContext[],
): string | null {
  if (!categoryId) return null;
  const match = contexts.find(
    (ctx) =>
      ctx.contextId === categoryId &&
      ctx.contextKey === ContextKey.EMAIL_CATEGORY,
  );
  return match ? parseCategoryName(match.contextValue) : null;
}
