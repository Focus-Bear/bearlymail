import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Email } from 'types/email';

// Basic selectors
export const selectEmails = (state: RootState): Email[] => state.email.emails;
export const selectOptimisticallyArchived = (state: RootState): string[] => 
  state.email.optimisticallyArchived;
export const selectOptimisticallySnoozed = (state: RootState): string[] => 
  state.email.optimisticallySnoozed;
export const selectLoading = (state: RootState): boolean => state.email.loading;
export const selectDecrypting = (state: RootState): boolean => state.email.decrypting;
export const selectRefreshing = (state: RootState): boolean => state.email.refreshing;
export const selectLoadingModeSwitch = (state: RootState): boolean => state.email.loadingModeSwitch;
export const selectFetchError = (state: RootState): string | null => state.email.fetchError;

// Memoized selector to filter out optimistically archived and snoozed emails
export const selectVisibleEmails = createSelector(
  [selectEmails, selectOptimisticallyArchived, selectOptimisticallySnoozed],
  (emails: Email[], optimisticallyArchived: string[], optimisticallySnoozed: string[]): Email[] => {
    const archivedSet = new Set(optimisticallyArchived);
    const snoozedSet = new Set(optimisticallySnoozed);
    return emails.filter(email => !archivedSet.has(email.id) && !snoozedSet.has(email.id));
  }
);

// Selector to check if an email is optimistically archived
export const selectIsOptimisticallyArchived = (emailId: string) =>
  (state: RootState): boolean => state.email.optimisticallyArchived.includes(emailId);

// Pagination selectors
export const selectHasMore = (state: RootState): boolean => state.email.hasMore;
export const selectTotalCount = (state: RootState): number => state.email.totalCount;
export const selectCurrentOffset = (state: RootState): number => state.email.currentOffset;

