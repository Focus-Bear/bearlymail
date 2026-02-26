import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email, getEmailPriorityScore } from 'types/email';

// Threshold for considering priority scores "equal" (matches backend RATIOS.TINY)
const PRIORITY_SCORE_TINY_THRESHOLD = 0.01;

export interface AnimatingOutItem {
  id: string;
  type: 'archive' | 'priority';
}

export interface CategorySummaryItem {
  id: string | null;
  name: string;
  count: number;
  threadIds?: string[];
}

interface EmailState {
  emails: Email[];
  optimisticallyArchived: string[];
  optimisticallySnoozed: string[];
  animatingOut: AnimatingOutItem[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  fetchError: string | null;
  hasMore: boolean;
  totalCount: number;
  currentOffset: number;
  categorySummary: CategorySummaryItem[] | null;
  summaryLoading: boolean;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
}

const initialState: EmailState = {
  emails: [],
  optimisticallyArchived: [],
  optimisticallySnoozed: [],
  animatingOut: [],
  loading: true,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  fetchError: null,
  hasMore: false,
  totalCount: 0,
  currentOffset: 0,
  categorySummary: null,
  summaryLoading: false,
  loadedCategoryNames: [],
  loadingCategoryNames: [],
};

const emailSlice = createSlice({
  name: 'email',
  initialState,
  reducers: {
    setEmails: (state, action: PayloadAction<Email[]>) => {
      state.emails = action.payload;
      state.currentOffset = 0;
    },
    appendEmails: (state, action: PayloadAction<Email[]>) => {
      const existingIds = new Set(state.emails.map(e => e.id));
      const newEmails = action.payload.filter(e => !existingIds.has(e.id));
      state.emails = [...state.emails, ...newEmails];
    },
    /**
     * Replace emails for a single category in-place without clearing other categories.
     * Used by the background polling refresh so updates happen invisibly.
     * "Other" category matches emails where category is null/undefined/empty string,
     * mirroring how getInboxSummary maps null categories to "Other".
     */
    updateCategoryEmails: (state, action: PayloadAction<{ categoryName: string; emails: Email[] }>) => {
      const { categoryName, emails } = action.payload;
      const isOther = categoryName === 'Other';
      // Remove emails that previously belonged to this category
      state.emails = state.emails.filter(e => {
        if (isOther) {
          // Keep emails that have a real (non-Other) category
          return e.category !== null && e.category !== undefined && e.category !== '' && e.category !== 'Other';
        }
        return e.category !== categoryName;
      });
      // Append the fresh emails (skip any that are already present from another category)
      const existingIds = new Set(state.emails.map(e => e.id));
      const newEmails = emails.filter(e => !existingIds.has(e.id));
      state.emails = [...state.emails, ...newEmails];
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
    addOptimisticArchive: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallyArchived.includes(action.payload)) {
        state.optimisticallyArchived.push(action.payload);
      }
    },
    removeOptimisticArchive: (state, action: PayloadAction<string>) => {
      state.optimisticallyArchived = state.optimisticallyArchived.filter(
        id => id !== action.payload
      );
    },
    addOptimisticSnooze: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallySnoozed.includes(action.payload)) {
        state.optimisticallySnoozed.push(action.payload);
      }
    },
    removeOptimisticSnooze: (state, action: PayloadAction<string>) => {
      state.optimisticallySnoozed = state.optimisticallySnoozed.filter(
        id => id !== action.payload
      );
    },
    removeEmail: (state, action: PayloadAction<string>) => {
      state.emails = state.emails.filter(email => email.id !== action.payload);
    },
    updateEmail: (state, action: PayloadAction<{ id: string; updates: Partial<Email> }>) => {
      const index = state.emails.findIndex(email => email.id === action.payload.id);
      if (index !== -1) {
        state.emails[index] = { ...state.emails[index], ...action.payload.updates };
      }
    },
    restoreEmail: (state, action: PayloadAction<Email>) => {
      // Insert email back in sorted order: priority DESC, threadUpdatedAt DESC, threadId (stable)
      const newEmails = [...state.emails, action.payload].sort((a, b) => {
        // Primary: priority score DESC
        const aScore = getEmailPriorityScore(a);
        const bScore = getEmailPriorityScore(b);
        if (Math.abs(bScore - aScore) > PRIORITY_SCORE_TINY_THRESHOLD) {
          return bScore - aScore;
        }
        // Secondary: threadUpdatedAt DESC
        const aUpdatedAt = a.threadUpdatedAt ? new Date(a.threadUpdatedAt).getTime() : 0;
        const bUpdatedAt = b.threadUpdatedAt ? new Date(b.threadUpdatedAt).getTime() : 0;
        if (bUpdatedAt !== aUpdatedAt) {
          return bUpdatedAt - aUpdatedAt;
        }
        // Final stable tiebreaker: threadId
        return a.threadId.localeCompare(b.threadId);
      });
      state.emails = newEmails;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setDecrypting: (state, action: PayloadAction<boolean>) => {
      state.decrypting = action.payload;
    },
    setRefreshing: (state, action: PayloadAction<boolean>) => {
      state.refreshing = action.payload;
    },
    setLoadingModeSwitch: (state, action: PayloadAction<boolean>) => {
      state.loadingModeSwitch = action.payload;
    },
    setFetchError: (state, action: PayloadAction<string | null>) => {
      state.fetchError = action.payload;
    },
    addAnimatingOut: (state, action: PayloadAction<AnimatingOutItem>) => {
      if (!state.animatingOut.find(item => item.id === action.payload.id)) {
        state.animatingOut.push(action.payload);
      }
    },
    removeAnimatingOut: (state, action: PayloadAction<string>) => {
      state.animatingOut = state.animatingOut.filter(item => item.id !== action.payload);
    },
    setCategorySummary: (state, action: PayloadAction<CategorySummaryItem[]>) => {
      state.categorySummary = action.payload;
      state.summaryLoading = false;
    },
    setSummaryLoading: (state, action: PayloadAction<boolean>) => {
      state.summaryLoading = action.payload;
    },
    markCategoryLoaded: (state, action: PayloadAction<string>) => {
      if (!state.loadedCategoryNames.includes(action.payload)) {
        state.loadedCategoryNames.push(action.payload);
      }
      state.loadingCategoryNames = state.loadingCategoryNames.filter(n => n !== action.payload);
    },
    markCategoryLoading: (state, action: PayloadAction<string>) => {
      if (!state.loadingCategoryNames.includes(action.payload)) {
        state.loadingCategoryNames.push(action.payload);
      }
    },
    clearCategoryState: (state) => {
      state.categorySummary = null;
      // Set summaryLoading = true immediately so isRefetchingWithoutData is true
      // from the moment we clear, preventing empty-state flashes.
      state.summaryLoading = true;
      state.loadedCategoryNames = [];
      state.loadingCategoryNames = [];
    },
    decrementCategorySummaryCount: (state, action: PayloadAction<string | { categoryName: string; count: number }>) => {
      const { categoryName, count } = typeof action.payload === 'string'
        ? { categoryName: action.payload, count: 1 }
        : action.payload;
      if (state.categorySummary) {
        const category = state.categorySummary.find(c => c.name === categoryName);
        if (category) {
          category.count = Math.max(0, category.count - count);
        }
      }
    },
    incrementCategorySummaryCount: (state, action: PayloadAction<string | { categoryName: string; count: number }>) => {
      const { categoryName, count } = typeof action.payload === 'string'
        ? { categoryName: action.payload, count: 1 }
        : action.payload;
      if (state.categorySummary) {
        const category = state.categorySummary.find(c => c.name === categoryName);
        if (category) {
          category.count += count;
        }
      }
    },
  },
});

export const {
  setEmails,
  appendEmails,
  updateCategoryEmails,
  setHasMore,
  setTotalCount,
  setCurrentOffset,
  addOptimisticArchive,
  removeOptimisticArchive,
  addOptimisticSnooze,
  removeOptimisticSnooze,
  removeEmail,
  updateEmail,
  restoreEmail,
  setLoading,
  setDecrypting,
  setRefreshing,
  setLoadingModeSwitch,
  setFetchError,
  addAnimatingOut,
  removeAnimatingOut,
  setCategorySummary,
  setSummaryLoading,
  markCategoryLoaded,
  markCategoryLoading,
  clearCategoryState,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
} = emailSlice.actions;

export default emailSlice.reducer;

