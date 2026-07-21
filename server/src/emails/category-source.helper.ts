/**
 * A single, human-readable provenance bucket for "which process assigned this
 * thread's category?", surfaced in the everyday priority/category popover.
 *
 * This mirrors the precedence the category debug UI already uses (see
 * `email-debug-category.service.ts` and `category-precedence.helper.ts`): the
 * stored `categorySource` is the authoritative bucket, with a proto-category
 * routing taking visual precedence over a plain AI pick. The client maps the
 * kind to a translated label so the wording stays in i18n.
 *
 * The former GitHub category override is intentionally NOT its own kind: that
 * override was removed (the reserved GitHub categories are now assigned by the
 * rule/local/LLM pipeline like any other), so attributing them to "GitHub"
 * would misreport which engine actually decided.
 */
import {
  LOCAL_CATEGORY_SOURCE,
  PRIORITY_CATEGORY_SOURCE,
  RULE_CATEGORY_SOURCE,
  SUMMARY_CATEGORY_SOURCE,
  USER_CATEGORY_SOURCE,
} from "./category-precedence.helper";

export type CategorizationSourceKind =
  "user" | "rule" | "local" | "proto" | "ai";

/**
 * Derives the categorisation-source bucket from the thread's stored provenance.
 * Returns null when nothing decided yet (uncategorised / still processing), so
 * callers can render nothing rather than a misleading label.
 */
export function deriveCategorizationSource(input: {
  categorySource: string | null;
  protoCategoryId: string | null;
}): CategorizationSourceKind | null {
  const { categorySource, protoCategoryId } = input;

  if (categorySource === USER_CATEGORY_SOURCE) {
    return "user";
  }
  if (categorySource === RULE_CATEGORY_SOURCE) {
    return "rule";
  }
  if (categorySource === LOCAL_CATEGORY_SOURCE) {
    return "local";
  }
  if (protoCategoryId) {
    return "proto";
  }
  if (
    categorySource === PRIORITY_CATEGORY_SOURCE ||
    categorySource === SUMMARY_CATEGORY_SOURCE
  ) {
    return "ai";
  }
  return null;
}
