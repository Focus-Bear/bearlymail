import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  normalizeCategoryNameForDedup,
  parseCategoryName,
} from "../utils/category-name.util";

/**
 * Resolves an LLM-supplied category name to a real EMAIL_CATEGORY context id.
 *
 * Tries an exact (case-insensitive) match on the category key or display name
 * first, then an emoji/punctuation-insensitive fallback via
 * `normalizeCategoryNameForDedup` — but ONLY when exactly one category
 * normalises to the same key. The fallback fixes the common case where the LLM
 * drops or swaps the stored leading emoji (e.g. returns "CI/CD & QA Pipeline
 * Failures" for "❌ CI/CD & QA Pipeline Failures"), which otherwise fails the
 * exact check and falls through to proto-fuzzy mis-routing. Ambiguous keys are
 * left unresolved rather than guessed.
 */
export function findCategoryContextId(
  emailCategories: UserContext[],
  name: string | null,
): string | null {
  if (!name || name === "Other") return null;
  const nameLower = name.toLowerCase().trim();
  const exact = emailCategories.find(
    (context) =>
      (context.categoryKey &&
        context.categoryKey.toLowerCase() === nameLower) ||
      parseCategoryName(context.contextValue).toLowerCase() === nameLower,
  );
  if (exact) return exact.contextId;

  const key = normalizeCategoryNameForDedup(name);
  if (!key) return null;
  const normMatches = emailCategories.filter(
    (context) =>
      normalizeCategoryNameForDedup(parseCategoryName(context.contextValue)) ===
      key,
  );
  return normMatches.length === 1 ? normMatches[0].contextId : null;
}

/**
 * Resolves a matched rule's authoritative `categoryId` to a live EMAIL_CATEGORY
 * context, returning its id and canonical name. Used when the rule's category
 * NAME no longer resolves (renamed/consolidated) but its id still points to a
 * real category — so the thread isn't dropped to Other. Returns null when the
 * rule has no category link or the linked category no longer exists.
 */
export function resolveRuleCategory(
  contexts: UserContext[],
  ruleCategoryId: string | null | undefined,
): { categoryId: string; name: string } | null {
  if (!ruleCategoryId) return null;
  const ctx = contexts.find(
    (context) =>
      context.contextId === ruleCategoryId &&
      context.contextKey === ContextKey.EMAIL_CATEGORY,
  );
  if (!ctx) return null;
  return {
    categoryId: ctx.contextId,
    name: parseCategoryName(ctx.contextValue),
  };
}

/**
 * When the name-based lookup failed (`categoryId` null) but the matched rule's
 * authoritative `ruleCategoryId` still points to a live category, returns that
 * category; otherwise returns the inputs unchanged. Keeps the branch out of the
 * already-complex resolver so it stays a single branch-free call there.
 */
export function preferRuleCategoryWhenNameUnresolved(
  categoryId: string | null,
  finalCategory: string | null,
  contexts: UserContext[],
  ruleCategoryId: string | null | undefined,
): { categoryId: string | null; finalCategory: string | null } {
  if (categoryId !== null) return { categoryId, finalCategory };
  const ruleCategory = resolveRuleCategory(contexts, ruleCategoryId);
  return ruleCategory
    ? { categoryId: ruleCategory.categoryId, finalCategory: ruleCategory.name }
    : { categoryId, finalCategory };
}

/** Pre-filters a user's contexts to email categories (small perf + clarity win). */
export function filterEmailCategories(contexts: UserContext[]): UserContext[] {
  return contexts.filter(
    (context) => context.contextKey === ContextKey.EMAIL_CATEGORY,
  );
}

/** Builds a `name -> categoryId` lookup closure over a user's email categories,
 * pre-filtering once so repeated lookups don't re-scan all contexts. */
export function makeCategoryContextIdLookup(
  contexts: UserContext[],
): (name: string | null) => string | null {
  const emailCategories = filterEmailCategories(contexts);
  return (name) => findCategoryContextId(emailCategories, name);
}
