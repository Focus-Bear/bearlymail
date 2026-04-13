import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email } from 'types/email';

export type CategoryFetchStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'exhausted' | 'stale';

export interface CategoryFetchState {
  status: CategoryFetchStatus;
  emails: Email[];
  fetchedAt: number | null;
  retryCount: number;
  nextRetryAt: number | null;
  error: string | null;
  /** Wall-clock ms when the fetch started — used to compute near-budget UI indicator */
  fetchStartedAt: number | null;
  /** True once the slow-fetch warning has been dispatched for the current fetch cycle */
  budgetWarningFired: boolean;
}

const DEFAULT_CATEGORY_STATE: CategoryFetchState = {
  status: 'idle',
  emails: [],
  fetchedAt: null,
  retryCount: 0,
  nextRetryAt: null,
  error: null,
  fetchStartedAt: null,
  budgetWarningFired: false,
};

export interface CategorySliceState {
  categories: Record<string, CategoryFetchState>;
}

const initialState: CategorySliceState = {
  categories: {},
};

// Status constants — used inside reducers and selectors to satisfy no-restricted-syntax lint rule.
const STATUS_LOADED: CategoryFetchStatus = 'loaded';
const STATUS_STALE: CategoryFetchStatus = 'stale';
const STATUS_LOADING: CategoryFetchStatus = 'loading';
const STATUS_EXHAUSTED: CategoryFetchStatus = 'exhausted';

const categorySlice = createSlice({
  name: 'category',
  initialState,
  reducers: {
    fetchStart: (state, action: PayloadAction<string>) => {
      const existing = state.categories[action.payload] ?? DEFAULT_CATEGORY_STATE;
      state.categories[action.payload] = {
        ...existing,
        status: STATUS_LOADING,
        error: null,
        fetchStartedAt: Date.now(),
        budgetWarningFired: false,
      };
    },
    fetchBudgetWarning: (state, action: PayloadAction<string>) => {
      const existing = state.categories[action.payload] ?? DEFAULT_CATEGORY_STATE;
      state.categories[action.payload] = { ...existing, budgetWarningFired: true };
    },
    fetchSuccess: (state, action: PayloadAction<{ key: string; emails: Email[]; fetchedAt: number }>) => {
      const { key, emails, fetchedAt } = action.payload;
      state.categories[key] = { ...DEFAULT_CATEGORY_STATE, status: STATUS_LOADED, emails, fetchedAt };
    },
    fetchError: (
      state,
      action: PayloadAction<{ key: string; error: string; retryCount: number; nextRetryAt: number }>
    ) => {
      const { key, error, retryCount, nextRetryAt } = action.payload;
      const existing = state.categories[key] ?? DEFAULT_CATEGORY_STATE;
      state.categories[key] = { ...existing, status: 'error', error, retryCount, nextRetryAt };
    },
    markExhausted: (state, action: PayloadAction<string>) => {
      const existing = state.categories[action.payload] ?? DEFAULT_CATEGORY_STATE;
      state.categories[action.payload] = { ...existing, status: STATUS_EXHAUSTED };
    },
    markStale: (state, action: PayloadAction<string>) => {
      const existing = state.categories[action.payload] ?? DEFAULT_CATEGORY_STATE;
      // Always initialize the entry (idle if new); only transition to stale if currently loaded.
      state.categories[action.payload] =
        existing.status === STATUS_LOADED ? { ...existing, status: STATUS_STALE } : { ...existing };
    },
    resetCategory: (state, action: PayloadAction<string>) => {
      state.categories[action.payload] = { ...DEFAULT_CATEGORY_STATE };
    },
    clearBudgetWarning: (state, action: PayloadAction<string>) => {
      const existing = state.categories[action.payload];
      if (existing) {
        existing.budgetWarningFired = false;
      }
    },
    resetAll: (state) => {
      state.categories = {};
    },
  },
});

export const { fetchStart, fetchBudgetWarning, fetchSuccess, fetchError, markExhausted, markStale, resetCategory, resetAll, clearBudgetWarning } = categorySlice.actions;

export default categorySlice.reducer;

export const selectAllCategoryStates = (state: { category: CategorySliceState }) => state.category.categories;

export const selectCategoryState =
  (key: string) =>
  (state: { category: CategorySliceState }): CategoryFetchState =>
    state.category.categories[key] ?? DEFAULT_CATEGORY_STATE;

export const selectCategoryStatus =
  (key: string) =>
  (state: { category: CategorySliceState }): CategoryFetchStatus =>
    state.category.categories[key]?.status ?? 'idle';

export const selectCategoryEmails =
  (key: string) =>
  (state: { category: CategorySliceState }): Email[] =>
    state.category.categories[key]?.emails ?? [];

export const selectLoadedCategoryKeys = createSelector(
  (state: { category: CategorySliceState }) => state.category.categories,
  (categories): string[] =>
    Object.entries(categories)
      .filter(([, catState]) => catState.status === STATUS_LOADED || catState.status === STATUS_STALE)
      .map(([key]) => key)
);

export const selectLoadingCategoryKeys = createSelector(
  (state: { category: CategorySliceState }) => state.category.categories,
  (categories): string[] =>
    Object.entries(categories)
      .filter(([, catState]) => catState.status === STATUS_LOADING)
      .map(([key]) => key)
);

export const selectCategoryBudgetWarning = (key: string) =>
  (state: { category: CategorySliceState }): boolean =>
    state.category.categories[key]?.budgetWarningFired ?? false;

/** Returns true if any category fetch has fired its budget-warning signal. */
export const selectAnyCategoryBudgetWarning = createSelector(
  (state: { category: CategorySliceState }) => state.category.categories,
  (categories): boolean =>
    Object.values(categories).some(cat => cat.budgetWarningFired)
);

export const selectExhaustedCategoryKeys = createSelector(
  (state: { category: CategorySliceState }) => state.category.categories,
  (categories): string[] =>
    Object.entries(categories)
      .filter(([, catState]) => catState.status === STATUS_EXHAUSTED)
      .map(([key]) => key)
);
