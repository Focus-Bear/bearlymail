import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email, getEmailPriorityScore } from 'types/email';

import { CATEGORY_OTHER } from 'constants/strings';

// Threshold for considering priority scores "equal" (matches backend RATIOS.TINY)
const PRIORITY_SCORE_TINY_THRESHOLD = 0.01;

/** Sentinel key used for threads with no categoryId (UUID-only grouping). */
export const CATEGORY_KEY_UNCATEGORIZED = 'uncategorized' as const;

export interface CategorySummaryItem {
  id: string | null;
  name: string;
  count: number;
  threadIds?: string[];
}

export interface InboxDataState {
  emails: Email[];
  hasMore: boolean;
  totalCount: number;
  currentOffset: number;
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  /** Category keys that have been permanently failed after exhausting all retries.
   *  Effect 2 will not re-fetch these until the user explicitly retries (resetCategoryExhausted). */
  exhaustedCategoryNames: string[];
  /** Unix timestamp (ms) of the last successful inbox fetch. Used for stale-while-revalidate caching. */
  lastFetchedAt: number | null;
}

const initialState: InboxDataState = {
  emails: [],
  hasMore: false,
  totalCount: 0,
  currentOffset: 0,
  categorySummary: null,
  loadedCategoryNames: [],
  loadingCategoryNames: [],
  exhaustedCategoryNames: [],
  lastFetchedAt: null,
};

const inboxDataSlice = createSlice({
  name: 'inboxData',
  initialState,
  reducers: {
    setEmails: (state, action: PayloadAction<Email[]>) => {
      state.emails = action.payload;
      state.currentOffset = 0;
    },
    appendEmails: (state, action: PayloadAction<Email[]>) => {
      const existingIds = new Set(state.emails.map(event => event.id));
      const newEmails = action.payload.filter(event => !existingIds.has(event.id));
      state.emails = [...state.emails, ...newEmails];
    },
    /**
     * Replace emails for a single category in-place without clearing other categories.
     * Used by the background polling refresh so updates happen invisibly.
     * "Other" category matches emails where category is null/undefined/empty string,
     * mirroring how getInboxSummary maps null categories to "Other".
     */
    updateCategoryEmails: (state, action: PayloadAction<{ categoryKey: string; emails: Email[] }>) => {
      const { categoryKey, emails } = action.payload;
      // categoryKey is a UUID or "uncategorized" (for threads with no categoryId).
      // NEVER a category name string.
      const isUncategorized = categoryKey === CATEGORY_KEY_UNCATEGORIZED;
      const incomingIds = new Set(emails.map(event => event.id));

      // UUID-only predicate: an email belongs to this category if its category_id matches the UUID key.
      // For uncategorized, match emails with no category_id.
      const matchesCategory = (email: Email) =>
        isUncategorized ? !email.category_id || email.category_id === null : email.category_id === categoryKey;

      // Fix #1114: prefer the server-enriched category_id on each email; only
      // fall back to categoryKey when the server did not supply one and this is not
      // the uncategorized bucket (avoid stamping "uncategorized" as a category_id).
      const stampedEmails = emails.map(email => ({
        ...email,
        category_id: email.category_id ?? (isUncategorized ? null : categoryKey),
      }));

      // Shallow equality guard: skip the array replacement if nothing meaningful changed.
      // Prevents unnecessary re-renders (and selectVisibleEmails recomputation) when
      // refreshInPlace returns data identical to what's already in the store.
      // Checks IDs and all fields that affect visible rendering in the list view.
      const currentCategoryEmails = state.emails.filter(event => matchesCategory(event));

      const isUnchanged =
        currentCategoryEmails.length === stampedEmails.length &&
        stampedEmails.every((incoming, idx) => {
          const existing = currentCategoryEmails[idx];
          return (
            existing?.id === incoming.id &&
            existing?.priorityScore === incoming.priorityScore &&
            existing?.isProcessingPriority === incoming.isProcessingPriority &&
            existing?.isProcessingSummary === incoming.isProcessingSummary &&
            existing?.isRead === incoming.isRead &&
            existing?.category_id === incoming.category_id
          );
        });

      if (isUnchanged) {
        // No state mutation → selectVisibleEmails input unchanged → no re-render
        return;
      }

      // Remove emails that previously belonged to this category AND any emails
      // whose ID matches an incoming email (they may have been loaded under a
      // different category due to concurrent fetches or backend category-sync races).
      state.emails = state.emails.filter(event => {
        if (incomingIds.has(event.id)) {
          return false;
        }
        return !matchesCategory(event);
      });
      state.emails = [...state.emails, ...stampedEmails];
    },
    removeEmail: (state, action: PayloadAction<string>) => {
      const emailToRemove = state.emails.find(email => email.id === action.payload);
      state.emails = state.emails.filter(email => email.id !== action.payload);

      // UUID-only: after removing the email, clean up the category summary if
      // this was the last email in its category. Match exclusively by category_id UUID.
      // Threads with no category_id are "uncategorized" (summary items with id === null).
      if (emailToRemove && state.categorySummary) {
        const catId = emailToRemove.category_id ?? null;
        // Defense-in-depth for #1404: treat emails with a stale category_id UUID that
        // resolved to "Other" as uncategorized, so the count decrement targets the
        // id === null summary bucket (not a missing stale-UUID bucket).
        const isOtherEmail = !catId || emailToRemove.category === CATEGORY_OTHER;
        const summaryItem = state.categorySummary.find(cat => (isOtherEmail ? cat.id === null : cat.id === catId));
        if (summaryItem) {
          const remainingInCategory = state.emails.filter(email =>
            isOtherEmail ? !email.category_id || email.category === CATEGORY_OTHER : email.category_id === catId
          );
          if (remainingInCategory.length === 0) {
            summaryItem.count = 0;
            state.categorySummary = state.categorySummary.filter(cat => cat !== summaryItem);
          }
        }
      }
    },
    updateEmail: (state, action: PayloadAction<{ id: string; updates: Partial<Email> }>) => {
      const index = state.emails.findIndex(email => email.id === action.payload.id);
      if (index !== -1) {
        state.emails[index] = { ...state.emails[index], ...action.payload.updates };
      }
    },
    restoreEmail: (state, action: PayloadAction<Email>) => {
      // Insert email back in sorted order: priority DESC, threadUpdatedAt DESC, threadId (stable)
      const newEmails = [...state.emails, action.payload].sort((itemA, itemB) => {
        // Primary: priority score DESC
        const aScore = getEmailPriorityScore(itemA);
        const bScore = getEmailPriorityScore(itemB);
        if (Math.abs(bScore - aScore) > PRIORITY_SCORE_TINY_THRESHOLD) {
          return bScore - aScore;
        }
        // Secondary: threadUpdatedAt DESC
        const aUpdatedAt = itemA.threadUpdatedAt ? new Date(itemA.threadUpdatedAt).getTime() : 0;
        const bUpdatedAt = itemB.threadUpdatedAt ? new Date(itemB.threadUpdatedAt).getTime() : 0;
        if (bUpdatedAt !== aUpdatedAt) {
          return bUpdatedAt - aUpdatedAt;
        }
        // Final stable tiebreaker: threadId
        return itemA.threadId.localeCompare(itemB.threadId);
      });
      state.emails = newEmails;
    },
    setHasMore: (state, action: PayloadAction<boolean>) => {
      state.hasMore = action.payload;
    },
    setTotalCount: (state, action: PayloadAction<number>) => {
      state.totalCount = action.payload;
    },
    setCurrentOffset: (state, action: PayloadAction<number>) => {
      state.currentOffset = action.payload;
    },
    setCategorySummary: (state, action: PayloadAction<CategorySummaryItem[]>) => {
      state.categorySummary = action.payload;
      // A summary refresh can disagree with a category the accordion loaded as empty
      // (a category fetch returned 0 emails but the summary reports count > 0). The old
      // behaviour clamped the count to 0, but that permanently hid REAL categories after
      // a single bad/mis-keyed empty fetch (the vanish-on-expand bug). The summary is the
      // more authoritative side, so keep its count and instead un-mark the category as
      // loaded: the accordion refetches its emails, and if the server again returns 0 the
      // reconciliation guard in useEmailFetching hides the category for good.
      if (!state.categorySummary) {
        return;
      }
      for (const cat of state.categorySummary) {
        if (cat.count === 0) {
          continue;
        }
        const catKey = cat.id ?? CATEGORY_KEY_UNCATEGORIZED;
        if (!state.loadedCategoryNames.includes(catKey)) {
          continue;
        }
        const isUncategorized = catKey === CATEGORY_KEY_UNCATEGORIZED;
        const hasEmails = state.emails.some(email =>
          isUncategorized ? !email.category_id : email.category_id === cat.id
        );
        if (!hasEmails) {
          state.loadedCategoryNames = state.loadedCategoryNames.filter(loadedKey => loadedKey !== catKey);
        }
      }
    },
    markCategoryLoaded: (state, action: PayloadAction<string>) => {
      if (!state.loadedCategoryNames.includes(action.payload)) {
        state.loadedCategoryNames.push(action.payload);
      }
      state.loadingCategoryNames = state.loadingCategoryNames.filter(name => name !== action.payload);
    },
    markCategoryLoading: (state, action: PayloadAction<string>) => {
      if (!state.loadingCategoryNames.includes(action.payload)) {
        state.loadingCategoryNames.push(action.payload);
      }
    },
    markCategoryLoadFailed: (state, action: PayloadAction<string>) => {
      // Remove from loading — but do NOT add to loaded.
      // This keeps isLoaded = false so the next expand triggers a retry.
      // Existing emails (if any) are intentionally preserved.
      state.loadingCategoryNames = state.loadingCategoryNames.filter(name => name !== action.payload);
    },
    /**
     * Permanently marks a category as exhausted after max retries.
     * Unlike markCategoryLoadFailed, this prevents Effect 2 from automatically re-fetching
     * until the user explicitly retries (dispatch resetCategoryExhausted).
     */
    markCategoryFetchExhausted: (state, action: PayloadAction<string>) => {
      state.loadingCategoryNames = state.loadingCategoryNames.filter(name => name !== action.payload);
      if (!state.exhaustedCategoryNames.includes(action.payload)) {
        state.exhaustedCategoryNames.push(action.payload);
      }
    },
    /**
     * Clears the exhausted state for a category so the user can manually retry.
     * Call this before re-invoking fetchCategoryEmails from the error UI.
     */
    resetCategoryExhausted: (state, action: PayloadAction<string>) => {
      state.exhaustedCategoryNames = state.exhaustedCategoryNames.filter(name => name !== action.payload);
    },
    clearCategoryState: state => {
      state.categorySummary = null;
      state.loadedCategoryNames = [];
      state.loadingCategoryNames = [];
      state.exhaustedCategoryNames = [];
    },
    decrementCategorySummaryCount: (state, action: PayloadAction<{ categoryKey: string; count: number }>) => {
      const { categoryKey, count } = action.payload;
      if (state.categorySummary) {
        // UUID-only: match by category UUID (id). "uncategorized" maps to items with id === null.
        const category = state.categorySummary.find(cat =>
          categoryKey === CATEGORY_KEY_UNCATEGORIZED ? cat.id === null : cat.id === categoryKey
        );
        if (category) {
          category.count = Math.max(0, category.count - count);
          // Remove the category from the summary once its count hits zero and no emails remain.
          if (category.count === 0) {
            const hasRemainingEmails = state.emails.some(email =>
              categoryKey === CATEGORY_KEY_UNCATEGORIZED
                ? !email.category_id || email.category_id === null
                : email.category_id === categoryKey
            );
            if (!hasRemainingEmails) {
              state.categorySummary = state.categorySummary.filter(cat => cat !== category);
            }
          }
        }
      }
    },
    incrementCategorySummaryCount: (state, action: PayloadAction<{ categoryKey: string; count: number }>) => {
      const { categoryKey, count } = action.payload;
      if (state.categorySummary) {
        // UUID-only: match by category UUID (id). "uncategorized" maps to items with id === null.
        const category = state.categorySummary.find(cat =>
          categoryKey === CATEGORY_KEY_UNCATEGORIZED ? cat.id === null : cat.id === categoryKey
        );
        if (category) {
          category.count += count;
        }
      }
    },
    /**
     * Explicitly set a category's summary count to 0 (and remove the entry if no remaining
     * emails reference it). Use this when the server has confirmed the category is empty,
     * rather than subtracting the cached count via decrementCategorySummaryCount — subtraction
     * is fragile if another action mutates the count between the read and the dispatch.
     */
    clearCategorySummaryCount: (state, action: PayloadAction<{ categoryKey: string }>) => {
      const { categoryKey } = action.payload;
      if (state.categorySummary) {
        const category = state.categorySummary.find(cat =>
          categoryKey === CATEGORY_KEY_UNCATEGORIZED ? cat.id === null : cat.id === categoryKey
        );
        if (category) {
          category.count = 0;
          const hasRemainingEmails = state.emails.some(email =>
            categoryKey === CATEGORY_KEY_UNCATEGORIZED
              ? !email.category_id || email.category_id === null
              : email.category_id === categoryKey
          );
          if (!hasRemainingEmails) {
            state.categorySummary = state.categorySummary.filter(cat => cat !== category);
          }
        }
      }
    },
    /**
     * Record the timestamp of the last successful inbox fetch.
     * Used by stale-while-revalidate logic to skip full re-fetches on navigation.
     */
    setLastFetchedAt: (state, action: PayloadAction<number>) => {
      state.lastFetchedAt = action.payload;
    },
    /** Invalidate the inbox cache, forcing the next navigation to trigger a full fetch. */
    invalidateInboxCache: state => {
      state.lastFetchedAt = null;
    },
  },
});

export const {
  setEmails,
  appendEmails,
  updateCategoryEmails,
  removeEmail,
  updateEmail,
  restoreEmail,
  setHasMore,
  setTotalCount,
  setCurrentOffset,
  setCategorySummary,
  markCategoryLoaded,
  markCategoryLoading,
  markCategoryLoadFailed,
  markCategoryFetchExhausted,
  resetCategoryExhausted,
  clearCategoryState,
  clearCategorySummaryCount,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  setLastFetchedAt,
  invalidateInboxCache,
} = inboxDataSlice.actions;

export default inboxDataSlice.reducer;
