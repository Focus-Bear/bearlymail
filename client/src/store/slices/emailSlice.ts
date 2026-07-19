/**
 * emailSlice — backward-compatibility re-exports
 *
 * This file previously contained all 30 actions in a single slice.
 * It has been split into:
 *   - inboxDataSlice  (email data, categories, pagination, cache)
 *   - inboxUISlice    (loading flags, optimistic updates, animations)
 *
 * All existing imports from this path continue to work unchanged.
 * New code should import directly from the specific slice file.
 */

import type { InboxDataState } from './inboxDataSlice';
import inboxDataReducer from './inboxDataSlice';
import type { InboxUIState } from './inboxUISlice';

// Combine the two state shapes into a legacy EmailState type for test compatibility
export type EmailState = InboxDataState & InboxUIState;

// Re-export types
export type { CategorySummaryItem, InboxDataState } from './inboxDataSlice';
export type { AnimatingOutItem, InboxUIState } from './inboxUISlice';

// Re-export inboxDataSlice actions (alphabetical)
export {
  appendEmails,
  clearCategoryState,
  clearCategorySummaryCount,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  invalidateInboxCache,
  markCategoryFetchExhausted,
  markCategoryLoaded,
  markCategoryLoadFailed,
  markCategoryLoading,
  removeEmail,
  resetCategoryExhausted,
  restoreEmail,
  setCategorySummary,
  setCurrentOffset,
  setEmails,
  setHasMore,
  setLastFetchedAt,
  setTotalCount,
  updateCategoryEmails,
  updateEmail,
} from './inboxDataSlice';

// Re-export inboxUISlice actions (alphabetical)
export {
  addAnimatingOut,
  addOptimisticArchive,
  addOptimisticSnooze,
  removeAnimatingOut,
  removeOptimisticArchive,
  removeOptimisticSnooze,
  setDecrypting,
  setFetchError,
  setLoading,
  setLoadingModeSwitch,
  setRefreshing,
  setSummaryLoading,
} from './inboxUISlice';

// Default export: combined reducer for test files that import `emailReducer from 'store/slices/emailSlice'`
// Tests using `reducer: { email: emailReducer }` will get only the inboxData state shape.
// The inboxUI state is handled by a separate reducer (inboxUIReducer).
// Test files that need both slices should import from the specific slice files.
export default inboxDataReducer;
