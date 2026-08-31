import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { measurePerformance } from 'utils/performanceBudget';

import categoryReducer from 'store/slices/categorySlice';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useCategoryFetch } from './useCategoryFetch';

vi.mock('utils/dev-logger', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
}));

// Note: async implementations must be set in beforeEach, not in the factory closure,
// because async functions in vi.mock factory closures do not resolve correctly.
vi.mock('utils/performanceBudget', () => ({
  measurePerformance: vi.fn(),
  ACCORDION_BUDGETS: { CATEGORY_FETCH: 2000, CATEGORY_PAINT: 500, CATEGORY_TOTAL: 3000 },
}));

vi.mock('hooks/useEmailFetching', () => ({
  getCategoryKey: (id: string | null | undefined, name: string) => id ?? name,
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      category: categoryReducer,
      inboxData: inboxDataReducer,
      inboxUI: inboxUIReducer,
    },
  });

const createWrapper = () => {
  const store = createTestStore();
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });
  return Wrapper;
};

const SUMMARY = [
  { id: 'cat-a', name: 'Alpha', count: 5 },
  { id: 'cat-b', name: 'Beta', count: 3 },
  { id: 'cat-c', name: 'Gamma', count: 2 },
  { id: 'cat-d', name: 'Delta', count: 1 },
];

describe('useCategoryFetch — lookahead preload', () => {
  let fetchCategoryEmails: jest.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCategoryEmails = vi.fn().mockResolvedValue(undefined);
    (measurePerformance as jest.Mock).mockImplementation(async (_opts: unknown, op: () => Promise<unknown>) => {
      const result = await op();
      return { result, durationMs: 100, overBudget: false, overageMs: 0 };
    });
  });

  const defaultProps = () => ({
    categorySummary: SUMMARY,
    fetchCategoryEmails,
    loadedCategoryNames: [],
    loadingCategoryNames: [],
    exhaustedCategoryNames: [],
  });

  it('does not expand the preloaded category visually', async () => {
    const { result } = renderHook(() => useCategoryFetch(defaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    // Expand only cat-a manually (simulating post-initial-load user click on a non-preloaded category)
    // For this test, reset auto-expand by collapsing everything first
    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await waitFor(() => {
      // cat-a was toggled open
      expect(result.current.expandedCategories.has('cat-a')).toBe(true);
      // cat-b should NOT be visually expanded (it is only silently preloaded)
      expect(result.current.expandedCategories.has('cat-b')).toBe(false);
    });
  });

  it('fetches the next unloaded category when user expands a category', async () => {
    const { result } = renderHook(() => useCategoryFetch(defaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    // Clear auto-expanded set so we control expansion precisely
    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    // Wait for initial effect to settle
    await act(async () => {
      await Promise.resolve();
    });

    fetchCategoryEmails.mockClear();

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await waitFor(() => {
      // cat-a fetch triggered directly by expansion
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Alpha', 'cat-a');
      // cat-b fetch triggered by lookahead preload
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Beta', 'cat-b');
    });
  });

  it('skips already-loaded categories when selecting lookahead target', async () => {
    const { result } = renderHook(
      () =>
        useCategoryFetch({
          ...defaultProps(),
          loadedCategoryNames: ['cat-b'], // cat-b already loaded
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    await act(async () => {
      await Promise.resolve();
    });

    fetchCategoryEmails.mockClear();

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await waitFor(() => {
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Alpha', 'cat-a');
      // cat-b is already loaded, so lookahead should skip to cat-c
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Gamma', 'cat-c');
      expect(fetchCategoryEmails).not.toHaveBeenCalledWith('Beta', 'cat-b');
    });
  });

  it('skips already-loading categories when selecting lookahead target', async () => {
    const { result } = renderHook(
      () =>
        useCategoryFetch({
          ...defaultProps(),
          loadingCategoryNames: ['cat-b'], // cat-b currently fetching
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    await act(async () => {
      await Promise.resolve();
    });

    fetchCategoryEmails.mockClear();

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await waitFor(() => {
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Alpha', 'cat-a');
      // cat-b is loading, lookahead should skip to cat-c
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Gamma', 'cat-c');
      expect(fetchCategoryEmails).not.toHaveBeenCalledWith('Beta', 'cat-b');
    });
  });

  it('does not trigger lookahead when collapsing a category', async () => {
    const { result } = renderHook(() => useCategoryFetch(defaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    // Pre-expand cat-a
    act(() => {
      result.current.setExpandedCategories(new Set(['cat-a']));
    });

    await act(async () => {
      await Promise.resolve();
    });

    fetchCategoryEmails.mockClear();

    // Collapse cat-a — should NOT trigger lookahead
    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await act(async () => {
      await Promise.resolve();
    });

    // No new fetch triggered for cat-b on collapse
    expect(fetchCategoryEmails).not.toHaveBeenCalledWith('Beta', 'cat-b');
    expect(result.current.expandedCategories.has('cat-a')).toBe(false);
  });

  it('does not preload if no unloaded category follows the expanded one', async () => {
    const singleSummary = [{ id: 'cat-a', name: 'Alpha', count: 5 }];
    const { result } = renderHook(
      () =>
        useCategoryFetch({
          ...defaultProps(),
          categorySummary: singleSummary,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a'], singleSummary);
    });

    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    await act(async () => {
      await Promise.resolve();
    });

    fetchCategoryEmails.mockClear();

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    await waitFor(() => {
      expect(fetchCategoryEmails).toHaveBeenCalledWith('Alpha', 'cat-a');
    });

    // Only one call — no lookahead target exists
    expect(fetchCategoryEmails).toHaveBeenCalledTimes(1);
  });

  it('resetForModeChange clears preload queue', async () => {
    const { result } = renderHook(() => useCategoryFetch(defaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c'], SUMMARY);
    });

    act(() => {
      result.current.setExpandedCategories(new Set());
    });

    act(() => {
      result.current.toggleCategory('cat-a');
    });

    act(() => {
      result.current.resetForModeChange();
    });

    await waitFor(() => {
      expect(result.current.expandedCategories.size).toBe(0);
      expect(result.current.stableCategoryOrder.length).toBe(0);
    });
  });
});

describe('useCategoryFetch — batch preload (#145)', () => {
  let fetchCategoryEmails: jest.Mock;
  let fetchCategoryEmailsBatch: jest.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCategoryEmails = vi.fn().mockResolvedValue(undefined);
    fetchCategoryEmailsBatch = vi
      .fn()
      .mockResolvedValue({ loadedKeys: ['cat-a', 'cat-b', 'cat-c', 'cat-d'], failedKeys: [] });
    (measurePerformance as jest.Mock).mockImplementation(async (_opts: unknown, op: () => Promise<unknown>) => {
      const result = await op();
      return { result, durationMs: 100, overBudget: false, overageMs: 0 };
    });
  });

  const batchProps = (summary = SUMMARY) => ({
    categorySummary: summary,
    fetchCategoryEmails,
    fetchCategoryEmailsBatch,
    loadedCategoryNames: [],
    loadingCategoryNames: [],
    exhaustedCategoryNames: [],
  });

  it('preloads the top categories in one batch call and suppresses the per-category fetches', async () => {
    const { result } = renderHook(() => useCategoryFetch(batchProps()), { wrapper: createWrapper() });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    await waitFor(() => expect(fetchCategoryEmailsBatch).toHaveBeenCalledTimes(1));
    // Items are ordered by count desc (Alpha 5, Beta 3, Gamma 2, Delta 1).
    expect(fetchCategoryEmailsBatch).toHaveBeenCalledWith([
      { name: 'Alpha', id: 'cat-a' },
      { name: 'Beta', id: 'cat-b' },
      { name: 'Gamma', id: 'cat-c' },
      { name: 'Delta', id: 'cat-d' },
    ]);

    // The reserved keys are skipped by the per-category effect — no duplicate single fetches.
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchCategoryEmails).not.toHaveBeenCalled();
  });

  it('excludes empty (count 0) categories from the batch', async () => {
    const summary = [
      { id: 'cat-a', name: 'Alpha', count: 5 },
      { id: 'cat-z', name: 'Zeta', count: 0 },
    ];
    const { result } = renderHook(() => useCategoryFetch(batchProps(summary)), { wrapper: createWrapper() });

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-z'], summary);
    });

    await waitFor(() => expect(fetchCategoryEmailsBatch).toHaveBeenCalledTimes(1));
    expect(fetchCategoryEmailsBatch).toHaveBeenCalledWith([{ name: 'Alpha', id: 'cat-a' }]);
  });

  it('falls back to per-category fetches when no batch preloader is provided', async () => {
    const { result } = renderHook(
      () =>
        useCategoryFetch({
          categorySummary: SUMMARY,
          fetchCategoryEmails,
          loadedCategoryNames: [],
          loadingCategoryNames: [],
          exhaustedCategoryNames: [],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.updateStableCategoryOrder(['cat-a', 'cat-b', 'cat-c', 'cat-d'], SUMMARY);
    });

    // Without a batch preloader the effect loads each expanded category individually.
    await waitFor(() => expect(fetchCategoryEmails).toHaveBeenCalledWith('Alpha', 'cat-a'));
    expect(fetchCategoryEmailsBatch).not.toHaveBeenCalled();
  });
});
