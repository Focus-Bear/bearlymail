/**
 * Entity-aware utilities for resolving category display names from
 * `UserContext` records.
 *
 * The pure string-parsing helpers (`parseCategoryName`,
 * `parseCategoryDescription`, `parseCategoryValue`) live in
 * `category-format.util.ts` so that `encryption.helper.ts` can use them
 * without dragging entity imports into its initialisation path (see
 * issue #1700). They are re-exported here so existing call sites continue to
 * work via `import { parseCategoryName } from "../utils/category-name.util"`.
 */

import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { parseCategoryName } from "./category-format.util";

export {
  canonicaliseCategoryName,
  normalizeCategoryNameForDedup,
  parseCategoryDescription,
  parseCategoryName,
  parseCategoryValue,
} from "./category-format.util";

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
