import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { useTabCounts } from './useTabCounts';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const TAB_COUNTS_CACHE_KEY = 'tabCountsCacheV2';

describe('useTabCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should initialize with null tab counts and start loading', async () => {
      mockedAxios.get.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useTabCounts());

      // On mount the hook immediately starts fetching, so loading is true
      expect(result.current.tabCounts).toBeNull();
      expect(result.current.loading).toBe(true);

      // After the fetch settles, loading becomes false
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.tabCounts).toBeNull();
    });
  });

  describe('fetchTabCounts', () => {
    it('should fetch tab counts from API and cache them', async () => {
      const mockCounts = { triage: 10, action: 5, followUp: 2 };
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: mockCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(mockCounts);
      });

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

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(cachedCounts);
      });

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
      // eslint-disable-next-line id-denylist
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
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: freshCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(freshCounts);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTabCountsOptimistically', () => {
    it('should update counts optimistically', async () => {
      const initialCounts = { triage: 10, action: 5, followUp: 2 };
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(initialCounts);
      });

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1 });
      });

      expect(result.current.tabCounts).toEqual({ triage: 9, action: 5, followUp: 2 });
    });

    it('should not allow counts to go below zero', async () => {
      const initialCounts = { triage: 0, action: 2, followUp: 1 };
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(initialCounts);
      });

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

      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).not.toBeNull();
      });

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
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(initialCounts);
      });

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
      // eslint-disable-next-line id-denylist
      mockedAxios.get.mockResolvedValue({ data: initialCounts });

      const { result } = renderHook(() => useTabCounts());

      await waitFor(() => {
        expect(result.current.tabCounts).toEqual(initialCounts);
      });

      act(() => {
        result.current.updateTabCountsOptimistically({ triage: -1, action: 1 });
      });

      expect(result.current.tabCounts).toEqual({ triage: 9, action: 6, followUp: 2 });
    });
  });
});
