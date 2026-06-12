import React from 'react';
import { useNavigate } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email, EnrichedSearchResult, GmailSearchResult } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';

import { applyRelevanceRanking, useSearch } from './useSearch';

// useSearch → useConnectedAccounts → useConnectedAccountsQuery (TanStack Query).
// Tests don't wrap in QueryClientProvider, so mock the query hook directly.
vi.mock('queries/useConnectedAccountsQuery', () => ({
  useConnectedAccountsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('axios');
// Mutable holder so URL-sync tests can change the simulated ?q= param between renders.
const urlSearchHolder = vi.hoisted(() => ({ current: '' }));
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  // Stable non-mock implementation so vitest's mockReset doesn't wipe it between tests.
  // The setter mirrors the real router by writing back to the holder, so the
  // URL-sync effect sees the same params handleSearch just pushed.
  useSearchParams: () => [
    new URLSearchParams(urlSearchHolder.current),
    (next: Record<string, string>) => {
      urlSearchHolder.current = new URLSearchParams(next).toString();
    },
  ],
}));
vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

describe('useSearch', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    urlSearchHolder.current = '';
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    window.alert = vi.fn();
    mockedUseNavigate.mockReturnValue(mockNavigate);
    // axios.isAxiosError is auto-mocked; restore real behaviour so error narrowing works
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockImplementation(err => err?.isAxiosError === true);
    // Mock connected-accounts call that happens on mount
    mockedAxios.get.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
      act(() => {
        result.current.handleSearch(mockEvent);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.progressStep).toBe('Searching for emails...');
    });

    it('should handle empty results', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValueOnce({ data: [] });

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
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

  describe('URL query sync', () => {
    it('runs the search from the URL on mount', async () => {
      urlSearchHolder.current = 'q=invoice';
      const { result } = renderHook(() => useSearch());

      await waitFor(() => {
        expect(result.current.hasSearched).toBe(true);
      });
      expect(result.current.query).toBe('invoice');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/emails/search'),
        expect.objectContaining({ params: expect.objectContaining({ q: 'invoice' }) })
      );
    });

    it('clearing the URL query resets the previous search input and results', async () => {
      urlSearchHolder.current = 'q=invoice';
      const { result, rerender } = renderHook(() => useSearch());

      await waitFor(() => {
        expect(result.current.hasSearched).toBe(true);
      });
      expect(result.current.query).toBe('invoice');

      // Simulate the sidebar Search click / manual clear removing ?q= from the URL.
      urlSearchHolder.current = '';
      rerender();

      await waitFor(() => {
        expect(result.current.hasSearched).toBe(false);
      });
      expect(result.current.query).toBe('');
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.instantResults).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('does not clear a query the user is typing on a blank search page', () => {
      const { result, rerender } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('draft query');
      });
      rerender();

      expect(result.current.query).toBe('draft query');
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

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
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
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call (searchStartMs): return a fixed time
      // Subsequent calls (phase1DurationMs): return 2500ms later
      return callCount === 1 ? 1000000 : 1002500;
    });

    mockedAxios.get.mockResolvedValueOnce({ data: [fakeEmail] });
    mockedAxios.post.mockResolvedValueOnce({ data: [] });

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSearch(mockEvent);
    });

    await waitFor(() => {
      const slowCalls = mockedCaptureEvent.mock.calls.filter(([eventName]) => eventName === 'search_slow');
      expect(slowCalls.length).toBeGreaterThan(0);
      expect(slowCalls[0][1]).toMatchObject({
        duration_ms: expect.any(Number),
        phase: 'initial',
      });
    });

    vi.spyOn(Date, 'now').mockRestore();
    Date.now = realDateNow;
  });

  it('does NOT fire SEARCH_SLOW when Phase 1 is fast', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('fast query');
    });

    // Simulate fast response: Date.now returns same value both times
    vi.spyOn(Date, 'now').mockReturnValue(1000000);

    const fakeEmail = { id: 'email-fast', subject: 'Fast', from: 'fast@example.com' };
    mockedAxios.get.mockResolvedValueOnce({ data: [fakeEmail] });
    mockedAxios.post.mockResolvedValueOnce({ data: [] });

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSearch(mockEvent);
    });

    await waitFor(() => {
      const slowCalls = mockedCaptureEvent.mock.calls.filter(([eventName]) => eventName === 'search_slow');
      expect(slowCalls).toHaveLength(0);
    });

    vi.spyOn(Date, 'now').mockRestore();
  });
});

describe('applyRelevanceRanking', () => {
  const enriched = (id: string, messageId: string): EnrichedSearchResult =>
    ({
      id,
      messageId,
      threadId: `thread-${id}`,
      subject: `Subject ${id}`,
      from: `${id}@example.com`,
      date: '2026-06-01T00:00:00.000Z',
      snippet: '',
      isRead: false,
      labelIds: [],
      enrichmentStatus: 'enriched',
      body: '',
    }) as EnrichedSearchResult;

  const pending = (messageId: string): GmailSearchResult => ({
    messageId,
    threadId: `thread-${messageId}`,
    subject: `Pending ${messageId}`,
    from: `${messageId}@example.com`,
    date: '2026-06-01T00:00:00.000Z',
    snippet: '',
    isRead: false,
    labelIds: [],
    enrichmentStatus: 'pending',
  });

  it('reorders enriched results by the ranked order and grafts relevance metadata', () => {
    const current = [enriched('a', 'm-a'), enriched('b', 'm-b'), enriched('c', 'm-c')];
    const ranked = [
      { id: 'c', relevanceScore: 95, searchExplanation: 'best' },
      { id: 'a', relevanceScore: 80, searchExplanation: 'ok' },
      { id: 'b', relevanceScore: 60, searchExplanation: 'meh' },
    ] as Array<Email & { relevanceScore?: number; searchExplanation?: string }>;

    const result = applyRelevanceRanking(current, ranked);

    expect(result.map(item => (item as EnrichedSearchResult).id)).toEqual(['c', 'a', 'b']);
    expect((result[0] as EnrichedSearchResult).relevanceScore).toBe(95);
    expect((result[0] as EnrichedSearchResult).searchExplanation).toBe('best');
  });

  it('keeps results the ranker dropped (e.g. still-pending) at the end, in original order', () => {
    const current = [enriched('a', 'm-a'), pending('m-x'), enriched('b', 'm-b')];
    // Ranker only returned 'b' then 'a'; the pending one was never enriched.
    const ranked = [
      { id: 'b', relevanceScore: 90 },
      { id: 'a', relevanceScore: 70 },
    ] as Array<Email & { relevanceScore?: number; searchExplanation?: string }>;

    const result = applyRelevanceRanking(current, ranked);

    expect(result.map(item => (item as EnrichedSearchResult).id ?? (item as GmailSearchResult).messageId)).toEqual([
      'b',
      'a',
      'm-x',
    ]);
    // The dropped/pending item is untouched (no relevance grafted).
    expect((result[2] as GmailSearchResult).enrichmentStatus).toBe('pending');
  });
});
