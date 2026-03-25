import React from 'react';
import { useNavigate } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';

import { useSearch } from './useSearch';

// useSearch → useConnectedAccounts → useConnectedAccountsQuery (TanStack Query).
// Tests don't wrap in QueryClientProvider, so mock the query hook directly.
jest.mock('queries/useConnectedAccountsQuery', () => ({
  useConnectedAccountsQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('axios');
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));
jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

describe('useSearch', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    window.alert = jest.fn();
    mockedUseNavigate.mockReturnValue(mockNavigate);
    // axios.isAxiosError is auto-mocked; restore real behaviour so error narrowing works
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockImplementation((err) => err?.isAxiosError === true);
    // Mock connected-accounts call that happens on mount
    mockedAxios.get.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useSearch());

      expect(result.current.query).toBe('');
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.hasSearched).toBe(false);
      expect(result.current.progressStep).toBe('');
    });
  });

  describe('handleSearch', () => {
    it('should not search when query is empty', async () => {
      const { result } = renderHook(() => useSearch());


      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should not search when query is only whitespace', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('   ');
      });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should perform search successfully', async () => {
      const { result } = renderHook(() => useSearch());


      const mockResults = [{ id: '1', subject: 'Test', from: 'test@example.com' }];

      act(() => {
        result.current.setQuery('test query');
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockResults });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toEqual(mockResults);
      expect(result.current.hasSearched).toBe(true);
      expect(mockedCaptureEvent).toHaveBeenCalledWith('search_performed', {
        query_length: 10,
        has_query: true,
        result_count: 1,
        selected_accounts: 0,
        phase: 'initial',
        duration_ms: expect.any(Number),
      });
    });

    it('should show progress steps during search', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      const delayedResponse = new Promise(resolve => {
        setTimeout(() => resolve({ data: [] }), 4000);
      });
      mockedAxios.get.mockImplementation(() => delayedResponse);

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      act(() => {
        result.current.handleSearch(mockEvent);
      });

      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current.progressStep).toBe('Searching for emails...');
    });

    it('should handle empty results', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValueOnce({ data: [] });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].id).toBe('no-results');
      expect((result.current.searchResults[0] as { debugInfo?: unknown }).debugInfo).toBeDefined();
    });

    it('should handle null response data', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValueOnce({ data: null });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].id).toBe('no-results');
    });

    it('should handle 401 unauthorized error', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      const error = {
        isAxiosError: true,
        response: { status: HTTP_UNAUTHORIZED },
      };
      mockedAxios.get.mockRejectedValueOnce(error);

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(window.alert).toHaveBeenCalledWith('Please log in again to search emails.');
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('should handle other errors', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      const error = new Error('Network error');
      mockedAxios.get.mockRejectedValueOnce(error);

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // getAxiosErrorMessage returns err.message for Error instances
      expect(window.alert).toHaveBeenCalledWith('Network error');
      expect(console.error).toHaveBeenCalledWith('Error searching emails:', error);
    });

    it('should clear progress step after search completes', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValueOnce({ data: [] });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.progressStep).toBe('');
      });
    });

    it('should clear progress step on error', async () => {
      const { result } = renderHook(() => useSearch());


      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockRejectedValueOnce(new Error('Error'));

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.progressStep).toBe('');
      });
    });
  });

  describe('setQuery', () => {
    it('should update query state', () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('new query');
      });

      expect(result.current.query).toBe('new query');
    });
  });
});

describe('search performance tracking (#1115)', () => {
  it('includes duration_ms in SEARCH_PERFORMED event for Phase 1', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('meeting notes');
    });

    const fakeEmail = { id: 'email-1', subject: 'Meeting', from: 'bob@example.com' };
    mockedAxios.get.mockResolvedValueOnce({ data: [fakeEmail] });
    // Phase 2 ranking returns empty
    mockedAxios.post.mockResolvedValueOnce({ data: [] });

    const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
    await act(async () => {
      jest.advanceTimersByTime(100);
      await result.current.handleSearch(mockEvent);
    });

    await waitFor(() => {
      const searchPerformedCalls = mockedCaptureEvent.mock.calls.filter(
        ([eventName]) => eventName === 'search_performed'
      );
      expect(searchPerformedCalls.length).toBeGreaterThan(0);
      const initialCall = searchPerformedCalls.find(([, props]) => props?.phase === 'initial');
      expect(initialCall).toBeDefined();
      expect(typeof initialCall?.[1]?.duration_ms).toBe('number');
    });
  });

  it('fires SEARCH_SLOW event when Phase 1 takes > 2000ms', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('slow search query');
    });

    const fakeEmail = { id: 'email-slow', subject: 'Slow', from: 'slow@example.com' };
    // Simulate slow response by manipulating Date.now
    const realDateNow = Date.now;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call (searchStartMs): return a fixed time
      // Subsequent calls (phase1DurationMs): return 2500ms later
      return callCount === 1 ? 1000000 : 1002500;
    });

    mockedAxios.get.mockResolvedValueOnce({ data: [fakeEmail] });
    mockedAxios.post.mockResolvedValueOnce({ data: [] });

    const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSearch(mockEvent);
    });

    await waitFor(() => {
      const slowCalls = mockedCaptureEvent.mock.calls.filter(
        ([eventName]) => eventName === 'search_slow'
      );
      expect(slowCalls.length).toBeGreaterThan(0);
      expect(slowCalls[0][1]).toMatchObject({
        duration_ms: expect.any(Number),
        phase: 'initial',
      });
    });

    jest.spyOn(Date, 'now').mockRestore();
    Date.now = realDateNow;
  });

  it('does NOT fire SEARCH_SLOW when Phase 1 is fast', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('fast query');
    });

    // Simulate fast response: Date.now returns same value both times
    jest.spyOn(Date, 'now').mockReturnValue(1000000);

    const fakeEmail = { id: 'email-fast', subject: 'Fast', from: 'fast@example.com' };
    mockedAxios.get.mockResolvedValueOnce({ data: [fakeEmail] });
    mockedAxios.post.mockResolvedValueOnce({ data: [] });

    const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSearch(mockEvent);
    });

    await waitFor(() => {
      const slowCalls = mockedCaptureEvent.mock.calls.filter(
        ([eventName]) => eventName === 'search_slow'
      );
      expect(slowCalls).toHaveLength(0);
    });

    jest.spyOn(Date, 'now').mockRestore();
  });
});
