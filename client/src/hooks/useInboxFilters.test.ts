import { act, renderHook } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD, PRIORITY_RANGES, useInboxFilters } from './useInboxFilters';

const STORAGE_KEY = 'inbox_filters';
const FIRST_LOAD_KEY = 'inbox_first_load_seen';

describe('PRIORITY_RANGES', () => {
  it('Very Low range uses min: null (no lower bound) instead of -Infinity', () => {
    const veryLow = PRIORITY_RANGES.find(range => range.label === 'Very Low');
    expect(veryLow).toBeDefined();
    expect(veryLow!.min).toBeNull();
    expect(veryLow!.max).toBe(0);
  });

  it('Very High range uses max: null (no upper bound)', () => {
    const veryHigh = PRIORITY_RANGES.find(range => range.label === 'Very High');
    expect(veryHigh).toBeDefined();
    expect(veryHigh!.min).toBe(50);
    expect(veryHigh!.max).toBeNull();
  });
});

describe('useInboxFilters', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('defaults to minPriority 50 when localStorage is empty (first visit)', () => {
      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
      expect(result.current.filters.accountIds).toEqual([]);
      expect(result.current.filters.categories).toEqual([]);
    });

    it('sets the first-load flag in localStorage on first visit', () => {
      renderHook(() => useInboxFilters());

      expect(localStorage.getItem(FIRST_LOAD_KEY)).toBe('1');
    });

    it('restores stored filters from localStorage on subsequent visits', () => {
      const storedFilters = { accountIds: [], categories: [], minPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
      localStorage.setItem(FIRST_LOAD_KEY, '1');

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
    });

    it('does not override stored minPriority: null with the default', () => {
      const storedFilters = { accountIds: [], categories: [], minPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();
    });

    it('falls back to default when localStorage JSON is malformed', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
      console.error = jest.fn();

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
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
      const storedFilters = { accountIds: [], categories: [], minPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));

      const { result } = renderHook(() => useInboxFilters());

      expect(result.current.filters.minPriority).toBeNull();

      act(() => {
        result.current.resetToHighPriority();
      });

      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
    });

    it('does not change accountIds or categories when resetting priority', () => {
      const storedFilters = { accountIds: ['acc-1'], categories: ['work'], minPriority: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));

      const { result } = renderHook(() => useInboxFilters());

      act(() => {
        result.current.resetToHighPriority();
      });

      expect(result.current.filters.accountIds).toEqual(['acc-1']);
      expect(result.current.filters.categories).toEqual(['work']);
      expect(result.current.filters.minPriority).toBe(HIGH_PRIORITY_THRESHOLD);
    });
  });

  describe('hasActiveFilters', () => {
    it('returns true when minPriority is set', () => {
      const { result } = renderHook(() => useInboxFilters());

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
