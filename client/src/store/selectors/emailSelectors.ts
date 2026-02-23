import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Email } from 'types/email';
import { AnimatingOutItem, CategorySummaryItem } from 'store/slices/emailSlice';

// Basic selectors
export const selectEmails = (state: RootState): Email[] => state.email.emails;
export const selectOptimisticallyArchived = (state: RootState): string[] =>
  state.email.optimisticallyArchived;
export const selectOptimisticallySnoozed = (state: RootState): string[] =>
  state.email.optimisticallySnoozed;
export const selectAnimatingOut = (state: RootState): AnimatingOutItem[] =>
  state.email.animatingOut ?? [];
export const selectLoading = (state: RootState): boolean => state.email.loading;
export const selectDecrypting = (state: RootState): boolean => state.email.decrypting;
export const selectRefreshing = (state: RootState): boolean => state.email.refreshing;
export const selectLoadingModeSwitch = (state: RootState): boolean => state.email.loadingModeSwitch;
export const selectFetchError = (state: RootState): string | null => state.email.fetchError;

// Memoized selector to filter out optimistically archived and snoozed emails.
// Emails that are currently animating out stay visible until the animation completes.
export const selectVisibleEmails = createSelector(
  [selectEmails, selectOptimisticallyArchived, selectOptimisticallySnoozed, selectAnimatingOut],
  (emails: Email[], optimisticallyArchived: string[], optimisticallySnoozed: string[], animatingOut: AnimatingOutItem[]): Email[] => {
    const archivedSet = new Set(optimisticallyArchived);
    const snoozedSet = new Set(optimisticallySnoozed);
    const animatingIds = new Set(animatingOut.map(item => item.id));
    return emails.filter(email =>
      // Keep email visible if it's animating out, even if it's also in the optimistic sets
      animatingIds.has(email.id) || (!archivedSet.has(email.id) && !snoozedSet.has(email.id))
    );
  }
);

// Selector to check if an email is optimistically archived
export const selectIsOptimisticallyArchived = (emailId: string) =>
  (state: RootState): boolean => state.email.optimisticallyArchived.includes(emailId);

// Pagination selectors
export const selectHasMore = (state: RootState): boolean => state.email.hasMore;
export const selectTotalCount = (state: RootState): number => state.email.totalCount;
export const selectCurrentOffset = (state: RootState): number => state.email.currentOffset;

// Category summary selectors
export const selectCategorySummary = (state: RootState): CategorySummaryItem[] | null => state.email.categorySummary;
export const selectSummaryLoading = (state: RootState): boolean => state.email.summaryLoading;
export const selectLoadedCategoryNames = (state: RootState): string[] => state.email.loadedCategoryNames;
export const selectLoadingCategoryNames = (state: RootState): string[] => state.email.loadingCategoryNames;

