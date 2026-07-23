import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { useTabCounts } from './useTabCounts';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const TAB_COUNTS_CACHE_KEY = 'tabCountsCacheV3';
const TAB_COUNTS_POLL_INTERVAL_MS = 30_000;

describe('useTabCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with null tab counts and loading=false', () => {
      const { result } = renderHook(() => useTabCounts());

      // No auto-fetch on mount — caller is responsible for calling fetchTabCounts()
      expect(result.current.tabCounts).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  describe('fetchTabCounts', () => {
    it('should fetch tab counts from API and cache them', async () => {
      const mockCounts = { triage: 10, action: 5, followUp: 2 };
      mockedAxios.get.mockResolvedValue({ data: mockCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(mockCounts);

      const cached = JSON.parse(localStorage.getItem(TAB_COUNTS_CACHE_KEY) || 'null');
      expect(cached).not.toBeNull();
      expect(cached.counts).toEqual(mockCounts);
      expect(cached.timestamp).toBeGreaterThan(0);
    });

    it('should use cache when available and within TTL', async () => {
      const cachedCounts = { triage: 64, action: 48, followUp: 2 };
      localStorage.setItem(
        TAB_COUNTS_CACHE_KEY,
        JSON.stringify({
          counts: cachedCounts,
          timestamp: Date.now(),
        })
      );

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(cachedCounts);

      // Should not have made an API call
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should bypass cache and fetch from API when force=true', async () => {
      const cachedCounts = { triage: 64, action: 48, followUp: 2 };
      localStorage.setItem(
        TAB_COUNTS_CACHE_KEY,
        JSON.stringify({
          counts: cachedCounts,
          timestamp: Date.now(),
        })
      );

      const freshCounts = { triage: 0, action: 5, followUp: 1 };
      mockedAxios.get.mockResolvedValue({ data: freshCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts(true);
      });

      expect(result.current.tabCounts).toEqual(freshCounts);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should fetch from API when cache is expired', async () => {
      const expiredCounts = { triage: 64, action: 48, followUp: 2 };
      localStorage.setItem(
        TAB_COUNTS_CACHE_KEY,
        JSON.stringify({
          counts: expiredCounts,
          timestamp: Date.now() - 60000, // 60 seconds ago (expired)
        })
      );

      const freshCounts = { triage: 0, action: 5, followUp: 1 };
      mockedAxios.get.mockResolvedValue({ data: freshCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(freshCounts);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTabCountsOptimistically', () => {
    it('should update counts optimistically', async () => {
      const initialCounts = { triage: 10, action: 5, followUp: 2 };
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(initialCounts);

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1 });
      });

      expect(result.current.tabCounts).toEqual({ triage: 9, action: 5, followUp: 2 });
    });

    it('should not allow counts to go below zero', async () => {
      const initialCounts = { triage: 0, action: 2, followUp: 1 };
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(initialCounts);

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -5 });
      });

      expect(result.current.tabCounts?.triage).toBe(0);
    });

    it('should preserve original cache timestamp when updating optimistically', async () => {
      const initialCounts = { triage: 10, action: 5, followUp: 2 };
      const originalTimestamp = Date.now() - 5000; // 5 seconds ago
      localStorage.setItem(
        TAB_COUNTS_CACHE_KEY,
        JSON.stringify({
          counts: initialCounts,
          timestamp: originalTimestamp,
        })
      );

      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).not.toBeNull();

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1 });
      });

      const cached = JSON.parse(localStorage.getItem(TAB_COUNTS_CACHE_KEY) || 'null');
      expect(cached).not.toBeNull();
      expect(cached.counts.triage).toBe(9);
      // Timestamp should NOT be reset to now - it should be the original or from API fetch
      // The key invariant: optimistic updates don't extend TTL beyond what the server last set
      expect(cached.timestamp).not.toBeGreaterThan(Date.now() - 4000);
    });

    it('should handle missing cache gracefully when updating optimistically', async () => {
      const initialCounts = { triage: 10, action: 5, followUp: 2 };
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(initialCounts);

      // Clear the cache
      localStorage.removeItem(TAB_COUNTS_CACHE_KEY);

      // Should not throw even if cache is missing
      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1 });
      });

      expect(result.current.tabCounts?.triage).toBe(9);
    });

    it('should update multiple mode counts in one call', async () => {
      const initialCounts = { triage: 10, action: 5, followUp: 2 };
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(result.current.tabCounts).toEqual(initialCounts);

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1, action: 1 });
      });

      expect(result.current.tabCounts).toEqual({ triage: 9, action: 6, followUp: 2 });
    });
  });

  describe('background polling', () => {
    it('should not poll before the first fetch has occurred', async () => {
      renderHook(() => useTabCounts());

      // Advance time past one poll interval — no fetch should happen since
      // hasEverFetchedRef is still false
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS);
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should poll with force=true after the first fetch completes', async () => {
      const initialCounts = { triage: 5, action: 3, followUp: 1 };
      const updatedCounts = { triage: 8, action: 3, followUp: 1 };
      mockedAxios.get
        .mockResolvedValueOnce({ data: initialCounts })
        .mockResolvedValueOnce({ data: updatedCounts });

      const { result } = renderHook(() => useTabCounts());

      // First explicit fetch
      await act(async () => {
        await result.current.fetchTabCounts(true);
      });

      expect(result.current.tabCounts).toEqual(initialCounts);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Advance time to trigger the background poll
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });

      expect(result.current.tabCounts).toEqual(updatedCounts);
    });

    it('should use the last-used filters when polling', async () => {
      // Categories/accounts are legitimate cross-mode narrowings that DO apply to the
      // badges (unlike the priority filter, which is stripped — see below).
      const filters = { categories: ['work'] };
      const initialCounts = { triage: 2, action: 1, followUp: 0 };
      const updatedCounts = { triage: 5, action: 1, followUp: 0 };
      mockedAxios.get
        .mockResolvedValueOnce({ data: initialCounts })
        .mockResolvedValueOnce({ data: updatedCounts });

      const { result } = renderHook(() => useTabCounts());

      // Fetch with filters
      await act(async () => {
        await result.current.fetchTabCounts(true, filters);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('categories=work'),
        expect.anything()
      );

      // Trigger background poll
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });

      // The poll should have used the same filters
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        expect.stringContaining('categories=work'),
        expect.anything()
      );
      expect(result.current.tabCounts).toEqual(updatedCounts);
    });

    it('never sends the priority filter — tab counts include all-priority Action/Follow-Up work', async () => {
      // Regression: the Triage guided High-and-above default must NOT filter the tab
      // counts, or the distraction-tax "existing work" snapshot under-counts Medium/Low
      // Action/Follow-Up threads and the inbox wrongly reads as "all cleared".
      const counts = { triage: 2, action: 4, followUp: 3 };
      mockedAxios.get.mockResolvedValue({ data: counts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts(true, { minPriority: 30, maxPriority: null });
      });

      const calledUrl = mockedAxios.get.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('minPriority');
      expect(calledUrl).not.toContain('maxPriority');
      // Counts reflect every Action/Follow-Up thread regardless of priority.
      expect(result.current.tabCounts).toEqual(counts);
    });

    it('should poll repeatedly on each interval tick', async () => {
      const counts = { triage: 1, action: 1, followUp: 0 };
      mockedAxios.get.mockResolvedValue({ data: counts });

      const { result } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts(true);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Advance three full poll intervals
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS * 3);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(4); // 1 initial + 3 polls
      });
    });

    it('should not set loading=true during background poll (silent mode)', async () => {
      const initialCounts = { triage: 5, action: 3, followUp: 1 };
      const updatedCounts = { triage: 8, action: 3, followUp: 1 };

      let resolveBackgroundFetch!: (value: unknown) => void;
      mockedAxios.get
        .mockResolvedValueOnce({ data: initialCounts })
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              resolveBackgroundFetch = resolve;
            })
        );

      const { result } = renderHook(() => useTabCounts());

      // First explicit fetch — loading should cycle true → false
      await act(async () => {
        await result.current.fetchTabCounts(true);
      });
      expect(result.current.loading).toBe(false);

      // Advance timer to trigger background poll — loading must NOT become true
      act(() => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS);
      });
      expect(result.current.loading).toBe(false);

      // Resolve the background fetch — loading should still remain false
      await act(async () => {
        resolveBackgroundFetch({ data: updatedCounts });
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.tabCounts).toEqual(updatedCounts);
    });

    it('should discard stale poll results when filters have changed', async () => {
      const filterA = { categories: ['a'] };
      const filterB = { categories: ['b'] };
      const countsForA = { triage: 20, action: 10, followUp: 5 };
      const countsForB = { triage: 3, action: 1, followUp: 0 };

      let resolveSlowFetch!: (value: unknown) => void;
      mockedAxios.get
        // First call: slow fetch for filterA (simulates in-flight poll)
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              resolveSlowFetch = resolve;
            })
        )
        // Second call: fast fetch for filterB
        .mockResolvedValueOnce({ data: countsForB });

      const { result } = renderHook(() => useTabCounts());

      // Start fetch for filterA (in flight, not yet resolved)
      const fetchAPromise = result.current.fetchTabCounts(true, filterA);

      // Immediately start fetch for filterB — this updates currentCacheKeyRef to keyB
      await act(async () => {
        await result.current.fetchTabCounts(true, filterB);
      });

      expect(result.current.tabCounts).toEqual(countsForB);

      // Now resolve the stale filterA fetch — state should NOT be overwritten
      await act(async () => {
        resolveSlowFetch({ data: countsForA });
        await fetchAPromise;
      });

      // Counts should still reflect filterB, not the stale filterA result
      expect(result.current.tabCounts).toEqual(countsForB);
    });

    it('should stop polling when the hook unmounts', async () => {
      const counts = { triage: 1, action: 0, followUp: 0 };
      mockedAxios.get.mockResolvedValue({ data: counts });

      const { result, unmount } = renderHook(() => useTabCounts());

      await act(async () => {
        await result.current.fetchTabCounts(true);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      unmount();

      // Advance past the poll interval — no further requests should fire
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS * 2);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should start polling after a cache hit on first fetch', async () => {
      const cachedCounts = { triage: 3, action: 2, followUp: 1 };
      localStorage.setItem(
        TAB_COUNTS_CACHE_KEY,
        JSON.stringify({ counts: cachedCounts, timestamp: Date.now() })
      );

      const updatedCounts = { triage: 6, action: 2, followUp: 1 };
      mockedAxios.get.mockResolvedValue({ data: updatedCounts });

      const { result } = renderHook(() => useTabCounts());

      // First fetch hits the cache (no API call)
      await act(async () => {
        await result.current.fetchTabCounts();
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(result.current.tabCounts).toEqual(cachedCounts);

      // Background poll should still fire and call the API with force=true
      await act(async () => {
        vi.advanceTimersByTime(TAB_COUNTS_POLL_INTERVAL_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      });

      expect(result.current.tabCounts).toEqual(updatedCounts);
    });
  });
});
