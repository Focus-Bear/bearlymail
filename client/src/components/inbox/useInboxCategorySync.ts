import { useEffect } from 'react';
import { Email, InboxMode } from 'types/email';

import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { groupEmailsByCategory } from './CategoryAccordion';

interface UseInboxCategorySyncParams {
  summaryCategories: CategorySummaryItem[] | null;
  filteredEmails: Email[];
  stableCategoryOrder: string[];
  /**
   * Passes categoryKeys + summaryItems so useCategoryFetch can sort by count desc
   * before auto-expanding the top INITIAL_PRELOAD_COUNT categories on mount.
   */
  onUpdateStableCategoryOrder: (order: string[], summaryItems?: CategorySummaryItem[]) => void;
  mode: InboxMode;
}

export function useInboxCategorySync({
  summaryCategories,
  filteredEmails,
  stableCategoryOrder,
  onUpdateStableCategoryOrder,
  mode,
}: UseInboxCategorySyncParams): void {
  useEffect(() => {
    if (summaryCategories && summaryCategories.length > 0) {
      const summaryKeys = summaryCategories.map(cat => getCategoryKey(cat.id, cat.name));
      if (stableCategoryOrder.length === 0) {
        onUpdateStableCategoryOrder(summaryKeys, summaryCategories);
      } else {
        const newKeys = summaryKeys.filter(key => !stableCategoryOrder.includes(key));
        if (newKeys.length > 0) {
          onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys], summaryCategories);
        }
      }
    } else if (!summaryCategories) {
      const categoryGroups = groupEmailsByCategory(filteredEmails, mode);
      if (categoryGroups.length > 0) {
        if (stableCategoryOrder.length === 0) {
          onUpdateStableCategoryOrder(categoryGroups.map(grp => grp.category), undefined);
        } else {
          const newKeys = categoryGroups
            .filter(grp => !stableCategoryOrder.includes(grp.category))
            .map(grp => grp.category);
          if (newKeys.length > 0) {
            onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys], undefined);
          }
        }
      }
    }
  }, [summaryCategories, stableCategoryOrder, onUpdateStableCategoryOrder, filteredEmails, mode]);
}
