import { createSelector } from '@reduxjs/toolkit';
import { Email } from 'types/email';

import { CategorySummaryItem } from 'store/slices/inboxDataSlice';
import { AnimatingOutItem } from 'store/slices/inboxUISlice';
import { RootState } from 'store/store';

// Basic selectors — email data (inboxData slice)
export const selectEmails = (state: RootState): Email[] => state.inboxData.emails;
export const selectHasMore = (state: RootState): boolean => state.inboxData.hasMore;
export const selectTotalCount = (state: RootState): number => state.inboxData.totalCount;
export const selectCurrentOffset = (state: RootState): number => state.inboxData.currentOffset;
export const selectCategorySummary = (state: RootState): CategorySummaryItem[] | null =>
  state.inboxData.categorySummary;
export const selectLoadedCategoryNames = (state: RootState): string[] => state.inboxData.loadedCategoryNames;
export const selectLoadingCategoryNames = (state: RootState): string[] => state.inboxData.loadingCategoryNames;
export const selectExhaustedCategoryNames = (state: RootState): string[] => state.inboxData.exhaustedCategoryNames ?? [];
export const selectLastFetchedAt = (state: RootState): number | null => state.inboxData.lastFetchedAt;

// Basic selectors — UI state (inboxUI slice)
export const selectOptimisticallyArchived = (state: RootState): string[] => state.inboxUI.optimisticallyArchived;
export const selectOptimisticallySnoozed = (state: RootState): string[] => state.inboxUI.optimisticallySnoozed;
export const selectAnimatingOut = (state: RootState): AnimatingOutItem[] => state.inboxUI.animatingOut ?? [];
export const selectLoading = (state: RootState): boolean => state.inboxUI.loading;
export const selectDecrypting = (state: RootState): boolean => state.inboxUI.decrypting;
export const selectRefreshing = (state: RootState): boolean => state.inboxUI.refreshing;
export const selectLoadingModeSwitch = (state: RootState): boolean => state.inboxUI.loadingModeSwitch;
export const selectSummaryLoading = (state: RootState): boolean => state.inboxUI.summaryLoading;
export const selectFetchError = (state: RootState): string | null => state.inboxUI.fetchError;

// Memoized selector to filter out optimistically archived and snoozed emails.
// Emails that are currently animating out stay visible until the animation completes.
export const selectVisibleEmails = createSelector(
  [selectEmails, selectOptimisticallyArchived, selectOptimisticallySnoozed, selectAnimatingOut],
  (
    emails: Email[],
    optimisticallyArchived: string[],
    optimisticallySnoozed: string[],
    animatingOut: AnimatingOutItem[]
  ): Email[] => {
    const archivedSet = new Set(optimisticallyArchived);
    const snoozedSet = new Set(optimisticallySnoozed);
    const animatingIds = new Set(animatingOut.map(item => item.id));
    return emails.filter(
      email =>
        // Keep email visible if it's animating out, even if it's also in the optimistic sets
        animatingIds.has(email.id) || (!archivedSet.has(email.id) && !snoozedSet.has(email.id))
    );
  }
);

// Selector to check if an email is optimistically archived
export const selectIsOptimisticallyArchived =
  (emailId: string) =>
  (state: RootState): boolean =>
    state.inboxUI.optimisticallyArchived.includes(emailId);

// Re-export categorySlice selectors
export {
  selectAllCategoryStates,
  selectCategoryEmails,
  selectCategoryState,
  selectCategoryStatus,
  selectExhaustedCategoryKeys,
  selectLoadedCategoryKeys,
  selectLoadingCategoryKeys,
} from 'store/slices/categorySlice';
