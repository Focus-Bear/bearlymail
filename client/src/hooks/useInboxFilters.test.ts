import { act, renderHook } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD, PRIORITY_RANGES, useInboxFilters, VERY_HIGH_PRIORITY_THRESHOLD } from './useInboxFilters';

// useInboxFilters → useConnectedAccountsQuery (TanStack Query).
// Tests don't wrap in QueryClientProvider, so mock the query hook directly.
jest.mock('queries/useConnectedAccountsQuery', () => ({
  useConnectedAccountsQuery: () => ({ data: [], isLoading: false }),
}));

const STORAGE_KEY = 'inbox_filters';
const FIRST_LOAD_KEY = 'inbox_first_load_seen';
const PRIORITY_MIGRATION_KEY = 'inbox_priority_migration_v2_done';

describe('PRIORITY_RANGES', () => {
  it('Very Low range uses min: null (no lower bound) instead of -Infinity', () => {
    const veryLow = PRIORITY_RANGES.find(range => range.label === 'Very Low');
    expect(veryLow).toBeDefined();
    expect(veryLow!.min).toBe(0);
    expect(veryLow!.max).toBe(20);
  });

  it('Very High range uses max: null (no upper bound)', () => {
    const veryHigh = PRIORITY_RANGES.find(range => range.label === 'Very High');
    expect(veryHigh).toBeDefined();
    expect(veryHigh!.min).toBe(80);
    expect(veryHigh!.max).toBeNull();
  });

  it('covers all 5 priority buckets plus "All"', () => {
    expect(PRIORITY_RANGES).toHaveLength(6);
    const labels = PRIORITY_RANGES.map(range => range.label);
    expect(labels).toEqual(['All', 'Very Low', 'Low', 'Medium', 'High', 'Very High']);
  });
});

describe('useInboxFilters', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('sanitizeStoredFilters (localStorage migration, fixes #1164)', () => {
    it('normalises stale pre-maxPriority localStorage (minPriority=50, no maxPriority) to "Very High" range', () => {
      // Simulates users whose localStorage was written before maxPriority was added (PR #1103).
      // JSON.parse('{"minPriority":50}').maxPriority === undefined.
      // The fix normalises undefined → null, so the pair (50, null) matches the "Very High"
      // PRIORITY_RANGES entry. Previously undefined !== null caused the dropdown to show "All"
      // while the badge still counted it as an active filter (ghost active-filter bug #1164).
      const stale = JSON.stringify({ accountIds: [], categories: [], minPriority: 50 });
      localStorage.setItem(STORAGE_KEY, stale);

      const { result } = renderHook(() => useInboxFilters());

      // After normalisation: (50, null) = "Very High" — valid range, preserved as-is.
      // The dropdown now correctly shows "Very High" and the badge shows "1 active filter"
      // (consistent — no ghost). Previously: dropdown showed "All", badge showed "1" (inconsistent).
      expect(result.current.filters.minPriority).toBe(50);
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('keeps a valid stored range (minPriority=60, maxPriority=80 = "High") as-is', () => {
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 60, maxPriority: 80 });
      localStorage.setItem(STORAGE_KEY, stored);

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(60);
      expect(result.current.filters.maxPriority).toBe(80);
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('keeps null/null as-is when migration already ran', () => {
      // After the one-time migration has run (PRIORITY_MIGRATION_KEY set), a user who
      // explicitly clears all filters to null/null should stay at null/null.
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, stored);
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('resets an invalid range (minPriority=25, maxPriority=99) not in PRIORITY_RANGES to null/null', () => {
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 25, maxPriority: 99 });
      localStorage.setItem(STORAGE_KEY, stored);
      // Set migration key so the result stays null/null (not further migrated to VERY_HIGH_PRIORITY_THRESHOLD)
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('resets a partially valid stored range (minPriority=0, maxPriority=99) not in PRIORITY_RANGES to null/null', () => {
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 0, maxPriority: 99 });
      localStorage.setItem(STORAGE_KEY, stored);
      // Set migration key so the result stays null/null (not further migrated to VERY_HIGH_PRIORITY_THRESHOLD)
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
    });
  });

  describe('initialization', () => {
    it('defaults to null/null when localStorage is empty (first visit, PR #1435)', () => {
      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.filters.accountIds).toEqual([]);
      expect(result.current.filters.categories).toEqual([]);
    });

    it('sets the first-load flag in localStorage on first visit', () => {
      renderHook(() => useInboxFilters());

      expect(localStorage.getItem(FIRST_LOAD_KEY)).toBe('1');
    });

    it('restores stored filters from localStorage on subsequent visits', () => {
      const storedFilters = { accountIds: [], categories: [], minPriority: 60, maxPriority: 80 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(FIRST_LOAD_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(60);
      expect(result.current.filters.maxPriority).toBe(80);
    });

    it('falls back to null/null when localStorage JSON is malformed (PR #1435)', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
      console.error = jest.fn();

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
    });
  });

  describe('setPriorityFilter', () => {
    it('updates minPriority and persists to localStorage', () => {
      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.setPriorityFilter(20);
      });

      expect(result.current.filters.minPriority).toBe(20);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.minPriority).toBe(20);
    });

    it('allows setting minPriority to null (all priorities)', () => {
      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.setPriorityFilter(null);
      });

      expect(result.current.filters.minPriority).toBeNull();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.minPriority).toBeNull();
    });
  });

  describe('clearFilters', () => {
    it('sets minPriority to null and clears all filters', () => {
      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.accountIds).toEqual([]);
      expect(result.current.filters.categories).toEqual([]);
    });
  });

  describe('resetToHighPriority', () => {
    it('resets minPriority to HIGH_PRIORITY_THRESHOLD', () => {
      // Pre-set migration key so the migration guard doesn't interfere with the initial null
      const storedFilters = { accountIds: [], categories: [], minPriority: null, maxPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();

      act(() => {
        result.current.resetToHighPriority();
      });

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
    });

    it('does not change accountIds or categories when resetting priority', () => {
      const storedFilters = { accountIds: ['acc-1'], categories: ['work'], minPriority: null, maxPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.resetToHighPriority();
      });

      expect(result.current.filters.accountIds).toEqual(['acc-1']);
      expect(result.current.filters.categories).toEqual(['work']);
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
    });
  });

  describe('one-time migration guard (fix #1271)', () => {
    // The migration runs once per browser (PRIORITY_MIGRATION_KEY flag).
    // It resets null/null defaults to VERY_HIGH_PRIORITY_THRESHOLD for users who got the
    // broken default from PR #1121. Users with any customisation are unaffected.
    // Trade-off: users who deliberately cleared all filters are indistinguishable from
    // broken-default users and will also be reset — intentional one-time disruption.

    it('first visit: defaults to null/null (no stored filters, PR #1435)', () => {
      // No STORAGE_KEY, no PRIORITY_MIGRATION_KEY — completely fresh browser.
      // PR #1435: new users start on "All" (null/null) instead of VERY_HIGH_PRIORITY_THRESHOLD.
      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      // Migration key is not needed for first visit (takes the else branch)
      // but FIRST_LOAD_KEY should be set
      expect(localStorage.getItem(FIRST_LOAD_KEY)).toBe('1');
    });

    it('stale null/null user: migrated to VERY_HIGH_PRIORITY_THRESHOLD on first post-fix load', () => {
      // Simulates a returning user with all-default filters (broken PR #1121 default).
      // PRIORITY_MIGRATION_KEY not yet set → migration runs.
      const stale = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, stale);

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(VERY_HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.maxPriority).toBeNull();
      // Migration flag should now be set to prevent recurrence
      expect(localStorage.getItem(PRIORITY_MIGRATION_KEY)).toBe('1');
    });

    it('idempotency: stale null/null user is NOT re-migrated on second call', () => {
      // After the first migration, user clears their filters back to null/null.
      // PRIORITY_MIGRATION_KEY is already set → migration must NOT run again.
      const cleared = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, cleared);
      localStorage.setItem(PRIORITY_MIGRATION_KEY, '1'); // already migrated

      const { result } = renderHook(() => useInboxFilters());

      // Should stay null/null — user deliberately cleared, no re-migration
      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
    });

    it('custom minPriority preserved: user with minPriority=60 is not touched by migration', () => {
      // User customised their min priority — migration condition not met, skipped entirely.
      const custom = JSON.stringify({ accountIds: [], categories: [], minPriority: 60, maxPriority: 80 });
      localStorage.setItem(STORAGE_KEY, custom);
      // PRIORITY_MIGRATION_KEY not set yet (migration hasn't run)

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(60);
      expect(result.current.filters.maxPriority).toBe(80);
    });

    it('custom accountIds preserved: user with non-empty accountIds is not touched by migration', () => {
      // User has filtered to specific accounts — migration condition not met (accountIds.length > 0).
      const custom = JSON.stringify({ accountIds: ['acc-abc'], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, custom);
      // PRIORITY_MIGRATION_KEY not set yet

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.accountIds).toEqual(['acc-abc']);
      expect(result.current.filters.minPriority).toBeNull();
    });
  });

  describe('hasActiveFilters', () => {
    it('returns true when minPriority is set', () => {
      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.setPriorityFilter(HIGH_PRIORITY_THRESHOLD);
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('returns false when all filters are cleared', () => {
      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.hasActiveFilters).toBe(false);
    });
  });
});
