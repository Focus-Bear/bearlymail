import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email, getEmailPriorityScore } from 'types/email';

import { CATEGORY_OTHER } from 'constants/strings';

// Threshold for considering priority scores "equal" (matches backend RATIOS.TINY)
const PRIORITY_SCORE_TINY_THRESHOLD = 0.01;

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
      // categoryKey is a UUID when the category has an ID, otherwise falls back to the
      // category name. "Other" is always keyed by name since it has no UUID.
      const isOther = categoryKey === CATEGORY_OTHER;
      const incomingIds = new Set(emails.map(event => event.id));

      // Shared predicate: an email belongs to this category if either its
      // category_id or its category name matches the key. Centralised here so
      // both the equality-guard filter and the removal step stay in sync.
      const matchesCategory = (email: Email) =>
        email.category_id === categoryKey || email.category === categoryKey;

      // Fix #1114: prefer the server-enriched category_id on each email; only
      // fall back to categoryKey when the server did not supply one.  Previously
      // categoryKey was unconditionally stamped, overriding the server's value.
      const stampedEmails = emails.map(email => ({
        ...email,
        category_id: email.category_id ?? categoryKey,
      }));

      // Shallow equality guard: skip the array replacement if nothing meaningful changed.
      // Prevents unnecessary re-renders (and selectVisibleEmails recomputation) when
      // refreshInPlace returns data identical to what's already in the store.
      // Checks IDs and all fields that affect visible rendering in the list view.
      const currentCategoryEmails = state.emails.filter(event =>
        isOther
          ? (!event.category || event.category === '' || event.category === CATEGORY_OTHER)
          : matchesCategory(event)
      );

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
        if (isOther) {
          return (
            event.category !== null &&
            event.category !== undefined &&
            event.category !== '' &&
            event.category !== CATEGORY_OTHER
          );
        }
        return !matchesCategory(event);
      });
      state.emails = [...state.emails, ...stampedEmails];
    },
    removeEmail: (state, action: PayloadAction<string>) => {
      const emailToRemove = state.emails.find(email => email.id === action.payload);
      state.emails = state.emails.filter(email => email.id !== action.payload);

      // Fix #1246: after removing the email, clean up the category summary if
      // this was the last email in its category. Keying by UUID (category_id) when
      // available; falling back to name for pre-backfill emails. This fixes the
      // data model so empty categories naturally disappear from the render list
      // instead of requiring guards wrapping broken state.
      if (emailToRemove && state.categorySummary) {
        const catId = emailToRemove.category_id;
        const catName = emailToRemove.category;
        const summaryItem = state.categorySummary.find(cat =>
          (catId && cat.id === catId) || (catName && cat.name === catName)
        );
        if (summaryItem) {
          const remainingInCategory = state.emails.filter(email =>
            (catId && email.category_id === catId) ||
            (!catId && catName && email.category === catName)
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
    decrementCategorySummaryCount: (
      state,
      action: PayloadAction<string | { categoryKey?: string; categoryName: string; count: number }>
    ) => {
      const { categoryKey, categoryName, count } =
        typeof action.payload === 'string'
          ? { categoryKey: undefined, categoryName: action.payload, count: 1 }
          : action.payload;
      if (state.categorySummary) {
        // Fix #1246: match by UUID first (when available), fall back to name.
        // Name-only matching breaks when LLM output drifts produce case/whitespace
        // differences between the email's category field and the summary item name.
        const category = state.categorySummary.find(
          cat => (categoryKey && cat.id === categoryKey) || cat.name === categoryName
        );
        if (category) {
          category.count = Math.max(0, category.count - count);
          // Fix #1246: remove the category from the summary once its count hits zero
          // and no emails remain. This fixes the data model so the render list
          // naturally excludes empty categories without needing per-render guards.
          if (category.count === 0) {
            const hasRemainingEmails = state.emails.some(
              email =>
                (categoryKey && email.category_id === categoryKey) ||
                email.category === categoryName
            );
            if (!hasRemainingEmails) {
              state.categorySummary = state.categorySummary.filter(cat => cat !== category);
            }
          }
        }
      }
    },
    incrementCategorySummaryCount: (state, action: PayloadAction<string | { categoryName: string; count: number }>) => {
      const { categoryName, count } =
        typeof action.payload === 'string' ? { categoryName: action.payload, count: 1 } : action.payload;
      if (state.categorySummary) {
        const category = state.categorySummary.find(cat => cat.name === categoryName);
        if (category) {
          category.count += count;
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
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  setLastFetchedAt,
  invalidateInboxCache,
} = inboxDataSlice.actions;

export default inboxDataSlice.reducer;
