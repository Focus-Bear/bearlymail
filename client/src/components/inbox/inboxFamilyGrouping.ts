import { InboxMode } from 'types/email';

import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { OTHER_FAMILY } from 'hooks/useCategoryFamilies';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

export interface FamilyGrouping {
  /** Categories reordered so same-family categories are adjacent. When no
   * families are known this is the input array unchanged. */
  ordered: CategorySummaryItem[];
  /** categoryKey → family name. */
  familyByKey: Map<string, string>;
  /** categoryKeys that begin a family block (render a family header before them). */
  firstInFamily: Set<string>;
  /** False when there are no families to group by — callers render the flat list. */
  isGrouped: boolean;
}

/**
 * Groups the inbox's category summary by family for the two-level accordion,
 * preserving each category's original order *within* a family and ordering the
 * family blocks by the priority of their highest-priority category (with the
 * synthetic "Other" family last).
 *
 * `displayCategories` arrives sorted by max thread priority (descending), so the
 * first category we encounter for a family is that family's highest-priority
 * category. Ranking families by that first-encounter position therefore sorts
 * the family blocks by their highest-priority thread — a family whose top thread
 * is "High Priority" outranks one whose top thread is "Low".
 *
 * Returns the categories unchanged (`isGrouped: false`) when no family mapping
 * is available, so the inbox renders exactly as before until families load.
 */
export function orderCategoriesByFamily(
  displayCategories: CategorySummaryItem[],
  familyByCategoryId: Map<string, string>,
): FamilyGrouping {
  if (familyByCategoryId.size === 0) {
    return {
      ordered: displayCategories,
      familyByKey: new Map(),
      firstInFamily: new Set(),
      isGrouped: false,
    };
  }

  const familyOf = (category: CategorySummaryItem): string =>
    familyByCategoryId.get(category.id ?? '') ?? OTHER_FAMILY;

  // Group preserving first-encounter order of both families and categories. A Map
  // preserves insertion order, so `blocks.keys()` is already in first-encounter
  // order — and because `displayCategories` arrives sorted by max thread priority
  // (descending), that order is highest-priority-first.
  const blocks = new Map<string, CategorySummaryItem[]>();
  for (const category of displayCategories) {
    const family = familyOf(category);
    const block = blocks.get(family);
    if (block) {
      block.push(category);
    } else {
      blocks.set(family, [category]);
    }
  }

  // Keys are already priority-ordered; only the synthetic "Other" family needs to
  // be pulled to the end.
  const families = [...blocks.keys()].filter(family => family !== OTHER_FAMILY);
  if (blocks.has(OTHER_FAMILY)) {
    families.push(OTHER_FAMILY);
  }

  const ordered: CategorySummaryItem[] = [];
  const familyByKey = new Map<string, string>();
  const firstInFamily = new Set<string>();
  for (const family of families) {
    const block = blocks.get(family) ?? [];
    block.forEach((category, indexInBlock) => {
      const key = getCategoryKey(category.id, category.name);
      familyByKey.set(key, family);
      if (indexInBlock === 0) {
firstInFamily.add(key);
}
      ordered.push(category);
    });
  }

  return { ordered, familyByKey, firstInFamily, isGrouped: true };
}

/**
 * Triage, Action and Follow Up all present a flat, strict top-score-descending
 * list of categories — the family is shown as a small label on each category card
 * instead of a nested two-level accordion. (Nested family blocks would drag a
 * family's lower-priority categories above other families' higher ones, since the
 * block sits at its highest category's position.)
 */
export function familyGroupingAppliesTo(mode: InboxMode): boolean {
  return (
    mode !== MODE_ACTION && mode !== MODE_FOLLOW_UP && mode !== MODE_TRIAGE
  );
}
