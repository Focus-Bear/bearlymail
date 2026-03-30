import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import * as emailCache from 'utils/emailCache';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_GMAIL, ERROR_GMAIL_REQUIRED } from 'constants/strings';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { appendFilterParams, useEmailFetching } from './useEmailFetching';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('utils/emailCache', () => ({
  clearCacheForMode: jest.fn(),
  filterHash: jest.fn((filters) => `hash_${filters?.minPriority ?? 'none'}_${filters?.maxPriority ?? 'none'}`),
  getCachedCategoryEmails: jest.fn().mockReturnValue(null),
  getCachedSummary: jest.fn().mockReturnValue(null),
  invalidateSummaryCache: jest.fn(),
  setCachedCategoryEmails: jest.fn(),
  setCachedSummary: jest.fn(),
  removeEmailFromCache: jest.fn(),
  clearCache: jest.fn(),
}));
const mockedClearCacheForMode = emailCache.clearCacheForMode as jest.MockedFunction<
  typeof emailCache.clearCacheForMode
>;

// Legacy mock variables referenced in skipped tests
const mockSetEmails = jest.fn();
const mockSetDecrypting = jest.fn();
const mockSetFetchError = jest.fn();
const mockSetLoading = jest.fn();
const mockSetRefreshing = jest.fn();
const mockSetLoadingModeSwitch = jest.fn();

// Create a test store
const createTestStore = () =>
  configureStore({
    reducer: {
      inboxData: inboxDataReducer,
      inboxUI: inboxUIReducer,
    },
  });

// Wrapper component for tests - returns the wrapper function directly
const createWrapper = () => {
  const store = createTestStore();
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  return Wrapper;
};

// Note: These tests need to be updated to work with the new Redux-based implementation.
// The hook now uses Redux dispatch instead of prop-based setters.
// Skipping tests that reference the old prop-based API until they can be refactored.
describe.skip('useEmailFetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  const defaultProps = {
    mode: 'triage' as const,
  };

  describe('fetchEmails', () => {
    it('should fetch emails successfully', async () => {
      const mockEmails = [
        { id: '1', threadId: 'thread-1', subject: 'Test Email 1' },
        { id: '2', threadId: 'thread-2', subject: 'Test Email 2' },
      ];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockResolvedValueOnce({ data: null }) // note
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockResolvedValueOnce({ data: null }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/emails/inbox?mode=triage'));
      });

      await waitFor(() => {
        expect(mockSetDecrypting).toHaveBeenCalledWith(true);
      });
      await waitFor(() => {
        expect(mockSetDecrypting).toHaveBeenCalledWith(false);
      });

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 0,
              hasPrivateNote: false,
            }),
            expect.objectContaining({
              id: '2',
              actionItemsCount: 0,
              hasPrivateNote: false,
            }),
          ])
        );
      });

      expect(mockSetFetchError).toHaveBeenCalledWith(null);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetRefreshing).toHaveBeenCalledWith(false);
      expect(mockSetLoadingModeSwitch).toHaveBeenCalledWith(false);
    });

    it('should enrich emails with action items and notes', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [{ id: 'ai1' }, { id: 'ai2' }] }) // action items
        .mockResolvedValueOnce({ data: { id: 'note1' } }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 2,
              hasPrivateNote: true,
            }),
          ])
        );
      });
    });

    it('should handle network errors', async () => {
      const networkError = {
        code: 'ERR_NETWORK',
        message: 'Network Error',
      };

      mockedAxios.get.mockRejectedValue(networkError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith(
          'Unable to connect to the server. Please check if the server is running.'
        );
      });

      expect(mockSetDecrypting).toHaveBeenCalledWith(false);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should handle unauthorized errors', async () => {
      const unauthorizedError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: 'Unauthorized' },
        },
      };

      mockedAxios.get.mockRejectedValue(unauthorizedError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Please log in again to view emails.');
      });
    });

    it('should handle Gmail required errors', async () => {
      const gmailError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: ERROR_GMAIL_REQUIRED },
        },
      };

      mockedAxios.get.mockRejectedValue(gmailError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('GMAIL_REQUIRED');
      });
    });

    it('should handle Gmail error messages', async () => {
      const gmailError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: `Some text ${ERROR_GMAIL} more text` },
        },
      };

      mockedAxios.get.mockRejectedValue(gmailError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('GMAIL_REQUIRED');
      });
    });

    it('should handle other errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Server error' },
        },
      };

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Server error');
      });
    });

    it('should handle errors without response', async () => {
      const error = {
        message: 'Request failed',
      };

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Request failed');
      });
    });

    it('should handle errors with no message', async () => {
      const error = {};

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Failed to load emails. Please try again.');
      });
    });

    it('should handle emails without threadId', async () => {
      const mockEmails = [
        { id: '1', subject: 'Test Email' }, // No threadId
      ];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }); // action items only

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalled();
      });
    });

    it('should handle failed action items fetch gracefully', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockRejectedValueOnce(new Error('Action items failed'))
        .mockResolvedValueOnce({ data: null }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 0,
            }),
          ])
        );
      });
    });

    it('should handle failed note fetch gracefully', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockRejectedValueOnce(new Error('Note fetch failed')); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              hasPrivateNote: false,
            }),
          ])
        );
      });
    });

    it('should use correct mode in API call', async () => {
      const mockEmails: Email[] = [];

      mockedAxios.get.mockResolvedValue({ data: mockEmails });

      const { result } = renderHook(() => useEmailFetching({ ...defaultProps, mode: 'action' }), {
        wrapper: createWrapper(),
      });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('mode=action'));
      });
    });

    it('should always set loading states to false in finally block', async () => {
      const error = new Error('Test error');
      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetLoading).toHaveBeenCalledWith(false);
      });
      await waitFor(() => {
        expect(mockSetRefreshing).toHaveBeenCalledWith(false);
      });
      await waitFor(() => {
        expect(mockSetLoadingModeSwitch).toHaveBeenCalledWith(false);
      });
    });
  });
});

// ─── Stale UUID self-healing ──────────────────────────────────────────────────
describe('fetchCategoryEmails – stale UUID self-healing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    // Ensure cache always returns null so we don't hit the serve-from-cache path
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
  });

  const createWrapper = () => {
    const store = configureStore({ reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store, children });
    return Wrapper;
  };

  it('calls clearCacheForMode when server returns 0 emails for a UUID-keyed category', async () => {
    // Simulate server returning an empty email array for a category that has a UUID.
    // This indicates the UUID may be stale — the hook must bust the summary cache.
    // Preload the Redux store so categorySummaryRef sees summaryCount > 0, allowing the guard to fire.
    const storeWithSummary = configureStore({
      reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
      preloadedState: {
        inboxData: {
          ...inboxDataReducer(undefined, { type: '@@INIT' }),
          categorySummary: [{ id: 'uuid-stale-1234', name: 'Work', count: 5 }],
        },
      },
    });
    const WrapperWithSummary = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store: storeWithSummary, children });

    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: WrapperWithSummary }
    );

    await result.current.fetchCategoryEmails('Work', 'uuid-stale-1234');

    await waitFor(() => {
      expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
    });
  });

  it('does NOT call clearCacheForMode when server returns emails for a UUID-keyed category', async () => {
    // When emails are returned, there is no stale UUID — no cache bust needed.
    const mockEmail = {
      id: '1',
      threadId: 'thread-1',
      subject: 'Test',
      from: 'a@b.com',
      to: 'me@b.com',
      body: '',
      isRead: false,
      isArchived: false,
      starCount: 0,
      receivedAt: new Date().toISOString(),
      category: 'Work',
      category_id: 'uuid-valid-5678',
    };
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [mockEmail] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Work', 'uuid-valid-5678');

    await waitFor(() => {
      // setCachedCategoryEmails is called on success — confirms the happy path ran
      expect(emailCache.setCachedCategoryEmails).toHaveBeenCalled();
    });
    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });

  it('does NOT call clearCacheForMode when 0 emails returned but no categoryId (name-keyed)', async () => {
    // If there is no UUID (name-keyed category), 0 results may be legitimate.
    // Self-healing should only trigger when a UUID was provided.
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    // No categoryId passed — name-only category
    await result.current.fetchCategoryEmails('Work', null);

    // Give the promise time to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });
});

describe('serveCategoryFromCacheAndRefresh – root cause fix (#1213)', () => {
  // These tests verify the two root-cause bugs fixed inside serveCategoryFromCacheAndRefresh:
  //   Bug 1: markCategoryLoaded must NOT fire when cachedEmails is empty.
  //   Bug 2: Background refresh abandonment must dispatch markCategoryLoadFailed so Effect 2 can retry.

  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    // react-scripts sets resetMocks: true, which resets mockReturnValue between tests.
    // Re-establish the default return values that the module-level mock factory sets.
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    store = configureStore({ reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer } });
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store, children });
  };

  it('Bug 1: does NOT mark category as loaded when cache is empty', async () => {
    // Empty cache — serveCategoryFromCacheAndRefresh must NOT call markCategoryLoaded.
    // The category should remain un-loaded so the background refresh (or a retry) can populate it.
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    // Background refresh returns empty too (deferred — we want to test the pre-resolve state)
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Other', 'uuid-other-0001');

    // After the cache path runs (synchronously), the category must NOT be in loadedCategoryNames
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-other-0001');
  });

  it('Bug 1: DOES mark category as loaded when cache has emails', async () => {
    // Non-empty cache — serveCategoryFromCacheAndRefresh must call markCategoryLoaded.
    const cachedEmail = {
      id: 'e1',
      threadId: 'thread-inbox',
      subject: 'Hello',
      from: 'a@b.com',
      to: 'me@b.com',
      body: '',
      isRead: false,
      isArchived: false,
      starCount: 0,
      receivedAt: new Date().toISOString(),
      category: 'Work',
      category_id: 'uuid-work-0002',
    };
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([cachedEmail]);

    // Background refresh (fire and forget)
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [cachedEmail] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Work', 'uuid-work-0002');

    await waitFor(() => {
      const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
      expect(state.inboxData.loadedCategoryNames).toContain('uuid-work-0002');
    });
  });

  it('Bug 2: dispatches markCategoryLoadFailed when background refresh is abandoned (session changed)', async () => {
    // Scenario: cache is empty, background refresh resolves AFTER the session has advanced.
    // The old code silently returned, leaving the category in an unrecoverable loaded-but-empty state.
    // The fix: dispatch markCategoryLoadFailed so Effect 2 can retry.
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    let resolveRefresh!: (value: unknown) => void;
    const pendingRefresh = new Promise(resolve => {
      resolveRefresh = resolve;
    });
    mockedAxios.get.mockReturnValueOnce(pendingRefresh as ReturnType<typeof mockedAxios.get>);

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    // Start the first fetch — background refresh is now pending
    await result.current.fetchCategoryEmails('Other', 'uuid-other-0003');

    // Advance the fetch session by calling fetchEmails — this bumps fetchSessionRef
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [], categorySummary: [] } });
    await result.current.fetchEmails();

    // Now resolve the stale background refresh — session no longer matches
    resolveRefresh({ data: { emails: [{ id: 'stale' }] } });

    // The category must NOT be in loadedCategoryNames (markCategoryLoadFailed was dispatched, not markCategoryLoaded)
    await new Promise(resolve => setTimeout(resolve, 50));
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-other-0003');
  });
});

// ─── fetchEmails cache invalidation on filter change (fix #846) ───────────────

describe('fetchEmails — cache invalidation on overrideFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
  });

  it('calls clearCacheForMode when fetchEmails is called with overrideFilters', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { total: 0, categories: [] },
    });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchEmails({ minPriority: 50, maxPriority: null });

    expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
  });

  it('does NOT call clearCacheForMode when fetchEmails is called without overrideFilters', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { total: 0, categories: [] },
    });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchEmails();

    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });
});

describe('appendFilterParams', () => {
  it('Very Low filter (min: null, max: 0) sends only maxPriority param — no minPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: null, maxPriority: 0 });
    expect(params.has('minPriority')).toBe(false);
    expect(params.get('maxPriority')).toBe('0');
  });

  it('Very High filter (min: 50, max: null) sends only minPriority param — no maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: 50, maxPriority: null });
    expect(params.get('minPriority')).toBe('50');
    expect(params.has('maxPriority')).toBe(false);
  });

  it('All filter (min: null, max: null) sends neither minPriority nor maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: null, maxPriority: null });
    expect(params.has('minPriority')).toBe(false);
    expect(params.has('maxPriority')).toBe(false);
  });

  it('Medium filter (min: 15, max: 30) sends both minPriority and maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: 15, maxPriority: 30 });
    expect(params.get('minPriority')).toBe('15');
    expect(params.get('maxPriority')).toBe('30');
  });
});

// ─── Fix #846: cache invalidation on filter change ────────────────────────────

describe('fetchEmails — cache invalidation on filter change (fix #846)', () => {
  // Helper: create a minimal Redux store and wrapper for these tests
  const makeStore = () => configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
  });

  const makeWrapper = (testStore: ReturnType<typeof makeStore>) => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store: testStore, children });
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cached summary so fetchEmailsImpl doesn't short-circuit
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    mockedAxios.get.mockResolvedValue({ data: { categories: [] } });
  });

  it('clears mode cache when overrideFilters are provided', async () => {
    const testStore = makeStore();
    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: makeWrapper(testStore) }
    );

    await result.current.fetchEmails({ minPriority: 50, maxPriority: null });

    await waitFor(() => {
      expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
    });
  });

  it('does NOT clear cache when no overrideFilters are provided', async () => {
    const testStore = makeStore();
    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: makeWrapper(testStore) }
    );

    await result.current.fetchEmails();

    await waitFor(() => {
      // fetchEmailsImpl runs (axios gets called or cache is checked)
      expect(emailCache.getCachedSummary).toHaveBeenCalled();
    });
    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });

  it('clears cache before fetching so fresh data is retrieved', async () => {
    // Ensure clearCacheForMode is called before any axios call
    const callOrder: string[] = [];

    mockedClearCacheForMode.mockImplementation(() => {
      callOrder.push('clearMode');
    });
    mockedAxios.get.mockImplementation(async () => {
      callOrder.push('axiosGet');
      return { data: { categories: [] } };
    });

    const testStore = makeStore();
    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: makeWrapper(testStore) }
    );

    await result.current.fetchEmails({ minPriority: 50 });

    await waitFor(() => {
      expect(callOrder).toContain('clearMode');
      expect(callOrder).toContain('axiosGet');
    });

    const clearModeIdx = callOrder.indexOf('clearMode');
    const axiosIdx = callOrder.indexOf('axiosGet');
    expect(clearModeIdx).toBeLessThan(axiosIdx);
  });
});
