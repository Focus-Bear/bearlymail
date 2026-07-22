import { act, renderHook } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD, PRIORITY_RANGES, useInboxFilters } from './useInboxFilters';

// useInboxFilters → useConnectedAccountsQuery (TanStack Query).
// Tests don't wrap in QueryClientProvider, so mock the query hook directly.
vi.mock('queries/useConnectedAccountsQuery', () => ({
  useConnectedAccountsQuery: () => ({ data: [], isLoading: false }),
}));

const STORAGE_KEY = 'inbox_filters';
const FIRST_LOAD_KEY = 'inbox_first_load_seen';
const PRIORITY_MIGRATION_V2_KEY = 'inbox_priority_migration_v2_done';
const PRIORITY_MIGRATION_V3_KEY = 'inbox_priority_migration_v3_score_ranges_done';

describe('PRIORITY_RANGES', () => {
  // Fix #1452 bug 3+4: bucket ranges now use actual server score values.
  // Old visual ranges: VL(0-20), L(20-40), M(40-60), H(60-80), VH(80-null)
  // New score ranges:  VL(null-0), L(0-15), M(15-30), H(30-50), VH(50-null)

  it('Very Low range uses min: null (no lower bound — scores below 0)', () => {
    const veryLow = PRIORITY_RANGES.find(range => range.label === 'Very Low');
    expect(veryLow).toBeDefined();
    expect(veryLow!.min).toBeNull(); // null = no lower bound, scores < 0
    expect(veryLow!.max).toBe(0); // server SQL: priorityScore < 0
  });

  it('High range uses actual server score boundaries (30-50, not visual 60-80)', () => {
    const high = PRIORITY_RANGES.find(range => range.label === 'High');
    expect(high).toBeDefined();
    expect(high!.min).toBe(30); // server SQL: priorityScore > 30
    expect(high!.max).toBe(50); // server SQL: priorityScore <= 50
  });

  it('Very High range uses min: 50 (actual server threshold, not visual 80)', () => {
    const veryHigh = PRIORITY_RANGES.find(range => range.label === 'Very High');
    expect(veryHigh).toBeDefined();
    expect(veryHigh!.min).toBe(50); // server SQL: priorityScore > 50
    expect(veryHigh!.max).toBeNull(); // no upper cap
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
    vi.clearAllMocks();
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
      // Set migration keys so further migration doesn't re-apply VH
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      // After normalisation: (50, null) = "Very High" — valid range, preserved as-is.
      expect(result.current.filters.minPriority).toBe(50);
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('resets old visual bucket High range (minPriority=60, maxPriority=80) to null/null — invalid after fix #1452', () => {
      // Before fix #1452, visual bucket values 0-20-40-60-80-100 were used.
      // Now actual score values are used: VL(null-0), L(0-15), M(15-30), H(30-50), VH(50-null).
      // The old visual High bucket (60, 80) is no longer valid and must be sanitised.
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 60, maxPriority: 80 });
      localStorage.setItem(STORAGE_KEY, stored);
      // Set both migration keys to prevent re-migration applying VH
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('keeps a valid stored score range (minPriority=30, maxPriority=50 = "High") as-is', () => {
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 30, maxPriority: 50 });
      localStorage.setItem(STORAGE_KEY, stored);
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(30);
      expect(result.current.filters.maxPriority).toBe(50);
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('keeps null/null as-is when both migration keys already ran', () => {
      // After both migrations have run, a user who explicitly clears filters stays at null/null.
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, stored);
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('resets an invalid range (minPriority=25, maxPriority=99) not in PRIORITY_RANGES to null/null', () => {
      const stored = JSON.stringify({ accountIds: [], categories: [], minPriority: 25, maxPriority: 99 });
      localStorage.setItem(STORAGE_KEY, stored);
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.hasActiveFilters).toBe(false);
    });
  });

  describe('initialization', () => {
    it('defaults to the guided High-and-above view (30/null) when localStorage is empty', () => {
      // Guided default: new users start at High-and-above (High + Very High). The
      // onboarding gate handles the initial analysis phase separately.
      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.maxPriority).toBeNull();
      expect(result.current.filters.accountIds).toEqual([]);
      expect(result.current.filters.categories).toEqual([]);
    });

    it('sets the first-load flag in localStorage on first visit', () => {
      renderHook(() => useInboxFilters());

      expect(localStorage.getItem(FIRST_LOAD_KEY)).toBe('1');
    });

    it('restores stored filters from localStorage on subsequent visits', () => {
      const storedFilters = { accountIds: [], categories: [], minPriority: 30, maxPriority: 50 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(FIRST_LOAD_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(30);
      expect(result.current.filters.maxPriority).toBe(50);
    });

    it('preserves the guided High-and-above filter (30/null) across reloads', () => {
      // 30/null is not one of the discrete slider buckets (High is bounded 30–50),
      // but it is the guided default and must survive sanitization on reload.
      const storedFilters = { accountIds: [], categories: [], minPriority: 30, maxPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(FIRST_LOAD_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.maxPriority).toBeNull();
    });

    it('falls back to the guided High-and-above view (30/null) when localStorage JSON is malformed', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
      console.error = vi.fn();

      const { result } = renderHook(() => useInboxFilters());

      // Falls through to the "no stored filters" branch → guided High-and-above default
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
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
      const storedFilters = { accountIds: [], categories: [], minPriority: null, maxPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

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
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.resetToHighPriority();
      });

      expect(result.current.filters.accountIds).toEqual(['acc-1']);
      expect(result.current.filters.categories).toEqual(['work']);
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
    });
  });

  describe('one-time migration guards', () => {
    it('v2 migration: stale null/null returning user is migrated to the guided High-and-above default', () => {
      // Simulates a returning user with all-default filters (broken PR #1121 default).
      // Neither migration key is set → both v2 and v3 migrations run.
      const stale = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, stale);

      const { result } = renderHook(() => useInboxFilters());

      // v2 migration fires first (null/null, empty filters) → resets to High-and-above
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.maxPriority).toBeNull();
      expect(localStorage.getItem(PRIORITY_MIGRATION_V2_KEY)).toBe('1');
    });

    it('v3 migration: old visual bucket user (null/null after sanitize) is re-migrated to High-and-above', () => {
      // Simulates a user who stored old visual VH bucket {80, null} from PR #1417.
      // sanitizeStoredFilters resets it to null/null (invalid range).
      // v2 migration key is already set (from prior session), but v3 is not.
      // v3 migration then fires and resets to the guided High-and-above default.
      const oldVisualVH = JSON.stringify({ accountIds: [], categories: [], minPriority: 80, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, oldVisualVH);
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1'); // v2 already ran
      // v3 not yet set

      const { result } = renderHook(() => useInboxFilters());

      // sanitize resets (80, null) → (null, null); v3 then fires → High-and-above
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.maxPriority).toBeNull();
      expect(localStorage.getItem(PRIORITY_MIGRATION_V3_KEY)).toBe('1');
    });

    it('idempotency: after both migrations, null/null is preserved (deliberate user choice)', () => {
      const cleared = JSON.stringify({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, cleared);
      localStorage.setItem(PRIORITY_MIGRATION_V2_KEY, '1');
      localStorage.setItem(PRIORITY_MIGRATION_V3_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
      expect(result.current.filters.maxPriority).toBeNull();
    });

    it('custom minPriority (30/50 = High) is preserved — migration condition not met', () => {
      const custom = JSON.stringify({ accountIds: [], categories: [], minPriority: 30, maxPriority: 50 });
      localStorage.setItem(STORAGE_KEY, custom);
      // Neither migration key set

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(30);
      expect(result.current.filters.maxPriority).toBe(50);
    });

    it('custom accountIds preserved: user with non-empty accountIds is not touched by migration', () => {
      const custom = JSON.stringify({ accountIds: ['acc-abc'], categories: [], minPriority: null, maxPriority: null });
      localStorage.setItem(STORAGE_KEY, custom);
      // Neither migration key set

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.accountIds).toEqual(['acc-abc']);
      expect(result.current.filters.minPriority).toBeNull();
    });
  });

  describe('hasActiveFilters', () => {
    it('returns true when minPriority is set', () => {
      const { result } = renderHook(() => useInboxFilters());

      // Initial state has VH filter active (fix #1452 bug 2)
      expect(result.current.hasActiveFilters).toBe(true);

      act(() => {
        result.current.clearFilters();
      });

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
