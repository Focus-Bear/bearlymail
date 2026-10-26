import type { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import type { EmailThread } from "../database/entities/email-thread.entity";
import { ContextKey } from "../database/entities/user-context.entity";

/** Category (UserContext) id → its family id; null for unfamilied categories. */
export type FamilyIdByCategoryId = ReadonlyMap<string, string | null>;

/** The user's category → family assignments (ids only, no decryption). */
export async function fetchFamilyIdByCategoryId(
  emailThreadRepository: Repository<EmailThread>,
  userId: string,
): Promise<FamilyIdByCategoryId> {
  const rows: Array<{ contextId: string; familyId: string | null }> =
    await emailThreadRepository.manager.query(
      `SELECT "contextId", "familyId"
         FROM user_contexts
        WHERE "userId" = $1 AND "contextKey" = $2`,
      [userId, ContextKey.EMAIL_CATEGORY],
    );
  return new Map(rows.map((row) => [row.contextId, row.familyId]));
}

function familyOf(
  categoryId: string | null,
  familyIdByCategoryId: FamilyIdByCategoryId,
): string | null {
  return categoryId ? (familyIdByCategoryId.get(categoryId) ?? null) : null;
}

/**
 * How many of a rule's false positives disqualify it. None when every false
 * positive sits in the target category's own family and together they are at
 * most RULE_SAME_FAMILY_MAX_FP_SHARE of the rule's matches; otherwise all of
 * them, exactly as the zero-false-positive gate always counted. A target with
 * no family (or no family data) tolerates nothing.
 */
export function countDisqualifyingFalsePositives(params: {
  falsePositiveCategoryIds: ReadonlyArray<string | null>;
  truePositives: number;
  targetCategoryId: string | null;
  familyIdByCategoryId?: FamilyIdByCategoryId;
}): number {
  const { falsePositiveCategoryIds, truePositives, familyIdByCategoryId } =
    params;
  const falsePositives = falsePositiveCategoryIds.length;
  if (falsePositives === 0 || !familyIdByCategoryId) return falsePositives;
  const targetFamily = familyOf(params.targetCategoryId, familyIdByCategoryId);
  if (!targetFamily) return falsePositives;
  const allInFamily = falsePositiveCategoryIds.every(
    (categoryId) => familyOf(categoryId, familyIdByCategoryId) === targetFamily,
  );
  const share = falsePositives / (truePositives + falsePositives);
  const isTolerable =
    allInFamily &&
    share <= CATEGORY_RULE_COMPOSITE.RULE_SAME_FAMILY_MAX_FP_SHARE;
  return isTolerable ? 0 : falsePositives;
}
