/**
 * One-fetch loading of everything category-rule evaluation needs, so batch
 * callers can match many emails from a single rules+categories round trip
 * (extracted from the service to stay under its line cap).
 */
import { Repository } from "typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import type { CategoryRuleEvaluationSet } from "./category-rules.types";

/**
 * The user's current categories as both a set of valid contextIds (for the
 * primary id-based eligibility check) and a name→id map (for the self-heal
 * fallback that re-links rules orphaned by a category regeneration — see
 * `resolveRuleCategoryId`). One query feeds both so the matcher stays a single
 * round-trip. The id set keeps its prior construction (including any null
 * contextIds) so the existing transient-empty fallback semantics are unchanged.
 */
export async function loadUserCategoryIndex(
  userContextRepository: Repository<UserContext>,
  userId: string,
): Promise<{
  validCategoryIds: Set<string>;
  categoryIdByName: Map<string, string>;
}> {
  const contexts = await userContextRepository.find({
    where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    select: {
      contextId: true,
      contextValue: true,
    },
  });
  const validCategoryIds = new Set(contexts.map((ctx) => ctx.contextId));
  const categoryIdByName = new Map<string, string>();
  for (const ctx of contexts) {
    const name = ctx.contextValue?.trim().toLowerCase();
    // First write wins so a stable category isn't shadowed by a later
    // same-named duplicate row left behind by an incomplete consolidation.
    if (name && ctx.contextId && !categoryIdByName.has(name)) {
      categoryIdByName.set(name, ctx.contextId);
    }
  }
  return { validCategoryIds, categoryIdByName };
}

/**
 * All rules (createdAt ASC — the trace reports disabled ones too) plus the
 * category eligibility index, fetched once. Batch callers load this per user
 * and evaluate every email against it in memory.
 */
export async function loadRuleEvaluationSet(
  categoryRuleRepository: Repository<CategoryRule>,
  userContextRepository: Repository<UserContext>,
  userId: string,
): Promise<CategoryRuleEvaluationSet> {
  const [rules, { validCategoryIds, categoryIdByName }] = await Promise.all([
    categoryRuleRepository.find({
      where: { userId },
      order: { createdAt: "ASC" },
    }),
    loadUserCategoryIndex(userContextRepository, userId),
  ]);
  return { rules, validCategoryIds, categoryIdByName };
}
