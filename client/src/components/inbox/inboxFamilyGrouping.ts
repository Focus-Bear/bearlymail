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
 * family blocks by `familyOrder` (with the synthetic "Other" family last).
 *
 * Returns the categories unchanged (`isGrouped: false`) when no family mapping
 * is available, so the inbox renders exactly as before until families load.
 */
export function orderCategoriesByFamily(
  displayCategories: CategorySummaryItem[],
  familyByCategoryId: Map<string, string>,
  familyOrder: string[],
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

  // Group preserving first-encounter order of both families and categories.
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

  const rank = (family: string): number => {
    if (family === OTHER_FAMILY) {
return Number.MAX_SAFE_INTEGER;
}
    const index = familyOrder.indexOf(family);
    return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
  };
  const families = [...blocks.keys()].sort((left, right) => rank(left) - rank(right));

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
