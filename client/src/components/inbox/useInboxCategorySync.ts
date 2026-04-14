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
        // Re-order existing categories to match the server's priority-sorted order.
        // The server sorts categories by their max thread priority score (descending),
        // so we always reflect the latest priority ranking rather than the initial load
        // order. Without this, a low-priority category (e.g. Newsletters, max -1) can
        // remain pinned at the top even after a high-priority category (e.g. Payments,
        // max 70) rises above it — because the old code only appended new keys.
        // Client-only keys (categories loaded lazily that the server hasn't reported yet)
        // are preserved at the end of the list.
        const serverKeySet = new Set(summaryKeys);
        const clientOnlyKeys = stableCategoryOrder.filter(key => !serverKeySet.has(key));
        const reorderedKeys = [...summaryKeys, ...clientOnlyKeys];
        // Only trigger an update when the order actually changed to avoid unnecessary
        // re-renders that could disrupt the user while they are reading.
        const orderChanged =
          reorderedKeys.length !== stableCategoryOrder.length ||
          reorderedKeys.some((key, idx) => key !== stableCategoryOrder[idx]);
        if (orderChanged) {
          onUpdateStableCategoryOrder(reorderedKeys, summaryCategories);
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
