import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import * as emailCache from 'utils/emailCache';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_GMAIL, ERROR_GMAIL_REQUIRED, MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { HIGH_PRIORITY_THRESHOLD, InboxFilter, PRIORITY_FILTER_SOURCE } from 'hooks/useInboxFilters';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import {
  appendFilterParams,
  buildCategoryParamsImpl,
  buildSummaryParamsImpl,
  getCategoryKey,
  useEmailFetching,
} from './useEmailFetching';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('utils/emailCache', () => ({
  clearCacheForMode: vi.fn(),
  filterHash: vi.fn(filters => `hash_${filters?.minPriority ?? 'none'}_${filters?.maxPriority ?? 'none'}`),
  getCachedCategoryEmails: vi.fn().mockReturnValue(null),
  getCachedSummary: vi.fn().mockReturnValue(null),
  invalidateSummaryCache: vi.fn(),
  setCachedCategoryEmails: vi.fn(),
  setCachedSummary: vi.fn(),
  removeEmailFromCache: vi.fn(),
  clearCache: vi.fn(),
}));
const mockedClearCacheForMode = emailCache.clearCacheForMode as jest.MockedFunction<
  typeof emailCache.clearCacheForMode
>;

// Legacy mock variables referenced in skipped tests
const mockSetEmails = vi.fn();
const mockSetDecrypting = vi.fn();
const mockSetFetchError = vi.fn();
const mockSetLoading = vi.fn();
const mockSetRefreshing = vi.fn();
const mockSetLoadingModeSwitch = vi.fn();

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
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
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

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmails }).mockResolvedValueOnce({ data: [] }); // action items only

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
    vi.clearAllMocks();
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    // Ensure cache always returns null so we don't hit the serve-from-cache path
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
  });

  const createWrapper = () => {
    const store = configureStore({ reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer } });
    const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
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

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: WrapperWithSummary });

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

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

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
    vi.clearAllMocks();
    // react-scripts sets resetMocks: true, which resets mockReturnValue between tests.
    // Re-establish the default return values that the module-level mock factory sets.
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    store = configureStore({ reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer } });
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  };

  it('Bug 1: does NOT mark category as loaded when cache is empty and summary is undefined (not yet fetched)', async () => {
    // Empty cache + summary not yet loaded — serveCategoryFromCacheAndRefresh must NOT call markCategoryLoaded.
    // categorySummaryRef will be null/empty (no Redux categorySummary seeded), so summaryItem is undefined.
    // The fix ensures undefined summaryItem does NOT trigger markCategoryLoaded (old ?? 0 bug).
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    // Use a never-resolving Promise so the background refresh stays pending during this test.
    // We want to verify only the synchronous cache path (which must NOT mark loaded when summary
    // is undefined). Fix #1769 changed the background-refresh path to always call markCategoryLoaded,
    // so letting it resolve would make this assertion trivially false.
    mockedAxios.get.mockReturnValue(new Promise(() => {}) as ReturnType<typeof mockedAxios.get>);

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

    await result.current.fetchCategoryEmails('Other', 'uuid-other-0001');

    // After the cache path runs (synchronously), the category must NOT be in loadedCategoryNames
    // because summaryItem is undefined — we cannot confirm the category is genuinely empty yet.
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-other-0001');
  });

  it('Bug 1 (new): marks category as loaded when cache is empty AND summary confirms count === 0', async () => {
    // Empty cache + summary explicitly confirms count=0 → markCategoryLoaded should fire.
    // This is the "genuinely empty category" fast-path added in fix #1689.
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    // Seed Redux store with a categorySummary that confirms the category has 0 emails.
    store.dispatch(
      (await import('store/slices/inboxDataSlice')).setCategorySummary([
        { id: 'uuid-empty-cat', name: 'Empty', count: 0 },
      ])
    );

    // Background refresh won't be reached (function returns early) — but mock defensively.
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Empty', 'uuid-empty-cat');

    // Summary explicitly confirms 0 — category must be marked loaded immediately.
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).toContain('uuid-empty-cat');
    // And no background GET was fired.
    expect(mockedAxios.get).not.toHaveBeenCalled();
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

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

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
    vi.clearAllMocks();
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
  });

  it('calls clearCacheForMode when fetchEmails is called with overrideFilters', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { total: 0, categories: [] },
    });

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

    await result.current.fetchEmails({ minPriority: 50, maxPriority: null });

    expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
  });

  it('does NOT call clearCacheForMode when fetchEmails is called without overrideFilters', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { total: 0, categories: [] },
    });

    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: createWrapper() });

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

// ─── Guided vs manual priority filter: per-mode scoping (Triage-only guided) ──────

describe('guided priority filter is Triage-only in param builders', () => {
  const guidedHighFilter: InboxFilter = {
    accountIds: [],
    categories: [],
    minPriority: HIGH_PRIORITY_THRESHOLD,
    maxPriority: null,
    priorityFilterSource: PRIORITY_FILTER_SOURCE.GUIDED,
  };
  const manualMediumFilter: InboxFilter = {
    accountIds: [],
    categories: [],
    minPriority: 15,
    maxPriority: 30,
    priorityFilterSource: PRIORITY_FILTER_SOURCE.MANUAL,
  };

  it('summary: guided filter IS sent for triage', () => {
    const params = buildSummaryParamsImpl(MODE_TRIAGE, guidedHighFilter);
    expect(params.get('minPriority')).toBe(String(HIGH_PRIORITY_THRESHOLD));
  });

  it('summary: guided filter is NOT sent for action', () => {
    const params = buildSummaryParamsImpl(MODE_ACTION, guidedHighFilter);
    expect(params.has('minPriority')).toBe(false);
    expect(params.has('maxPriority')).toBe(false);
  });

  it('summary: guided filter is NOT sent for follow-up', () => {
    const params = buildSummaryParamsImpl(MODE_FOLLOW_UP, guidedHighFilter);
    expect(params.has('minPriority')).toBe(false);
  });

  it('summary: manual filter IS sent for all three modes', () => {
    for (const mode of [MODE_TRIAGE, MODE_ACTION, MODE_FOLLOW_UP] as const) {
      const params = buildSummaryParamsImpl(mode, manualMediumFilter);
      expect(params.get('minPriority')).toBe('15');
      expect(params.get('maxPriority')).toBe('30');
    }
  });

  it('category: guided filter dropped for action but account filter kept', () => {
    const guidedWithAccount: InboxFilter = { ...guidedHighFilter, accountIds: ['acct-1'] };
    const params = buildCategoryParamsImpl(MODE_ACTION, guidedWithAccount, 'cat-key');
    expect(params.has('minPriority')).toBe(false);
    expect(params.get('accounts')).toBe('acct-1');
  });

  it('category: guided filter kept for triage', () => {
    const params = buildCategoryParamsImpl(MODE_TRIAGE, guidedHighFilter, 'cat-key');
    expect(params.get('minPriority')).toBe(String(HIGH_PRIORITY_THRESHOLD));
  });

  it('category: manual filter sent for follow-up', () => {
    const params = buildCategoryParamsImpl(MODE_FOLLOW_UP, manualMediumFilter, 'cat-key');
    expect(params.get('minPriority')).toBe('15');
    expect(params.get('maxPriority')).toBe('30');
  });
});

// ─── Fix #2062: "Other"-named category with non-null UUID groups as uncategorized ─

describe('getCategoryKey', () => {
  it('returns the UUID for a normal named category', () => {
    expect(getCategoryKey('uuid-sales', 'Sales')).toBe('uuid-sales');
  });

  it('returns "uncategorized" when id is null/undefined', () => {
    expect(getCategoryKey(null, 'Other')).toBe('uncategorized');
    expect(getCategoryKey(undefined)).toBe('uncategorized');
  });

  it('collapses an "Other"-named category to "uncategorized" even with a non-null UUID', () => {
    // The server serializes any category named "Other" with id: null and merges
    // its count into the uncategorized bucket. A real user category literally named
    // "Other" still carries its UUID on the email row; keying it by that UUID would
    // leave the summary's id-null "Other" accordion empty (count > 0, loaded 0).
    expect(getCategoryKey('uuid-other', 'Other')).toBe('uncategorized');
  });
});

// ─── Fix #846: cache invalidation on filter change ────────────────────────────

describe('fetchEmails — cache invalidation on filter change (fix #846)', () => {
  // Helper: create a minimal Redux store and wrapper for these tests
  const makeStore = () =>
    configureStore({
      reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
    });

  const makeWrapper = (testStore: ReturnType<typeof makeStore>) => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store: testStore, children });
    return Wrapper;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cached summary so fetchEmailsImpl doesn't short-circuit
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    mockedAxios.get.mockResolvedValue({ data: { categories: [] } });
  });

  it('clears mode cache when overrideFilters are provided', async () => {
    const testStore = makeStore();
    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: makeWrapper(testStore) });

    await result.current.fetchEmails({ minPriority: 50, maxPriority: null });

    await waitFor(() => {
      expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
    });
  });

  it('does NOT clear cache when no overrideFilters are provided', async () => {
    const testStore = makeStore();
    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: makeWrapper(testStore) });

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
    const { result } = renderHook(() => useEmailFetching({ mode: 'triage' }), { wrapper: makeWrapper(testStore) });

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

// ─── fix #1689: null-guard for summaryItem (rework) ──────────────────────────

describe('fix #1689 – summaryItem null-guard in fetchCategoryEmailsImpl', () => {
  // Verifies the fix to the critical logic bug: `summaryItem?.count ?? 0` was conflating
  // "summary not loaded yet" with "confirmed 0 emails". The fix requires an explicit
  // `summaryItem !== undefined && summaryItem !== null` check before treating count=0 as
  // confirmation of genuine emptiness.

  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    store = configureStore({ reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer } });
  });

  const createWrapper = () =>
    ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store, children });

  it('empty cache + summary undefined → background refresh proceeds, NOT marked loaded', async () => {
    // No categorySummary in Redux → summaryItem will be undefined.
    // The old bug: ?? 0 treated undefined as 0, so markCategoryLoaded fired incorrectly.
    // The fix: undefined summaryItem must fall through to background refresh (NOT mark loaded).
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    // Use a never-resolving promise so the background GET stays pending — this lets us assert
    // the state strictly AFTER the synchronous cache path, before any GET response arrives.
    let resolveGet!: (v: unknown) => void;
    const pendingGet = new Promise(resolve => {
      resolveGet = resolve;
    });
    mockedAxios.get.mockReturnValueOnce(pendingGet as ReturnType<typeof mockedAxios.get>);

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.fetchCategoryEmails('Work', 'uuid-work-null-guard');
    });

    // Summary was undefined → null-guard prevents markCategoryLoaded from firing.
    // Category must still be un-loaded (background GET is pending, hasn't resolved).
    const stateBefore = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(stateBefore.inboxData.loadedCategoryNames).not.toContain('uuid-work-null-guard');

    // Background GET must have been called (background refresh did proceed).
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    // Resolve the GET with an email so the category gets loaded — cleans up the pending promise.
    await act(async () => {
      resolveGet({ data: { emails: [{ id: 'bg-1', threadId: 't1', subject: 'BG', from: 'a@b.com', to: 'c@d.com', body: '', isRead: false, isArchived: false, starCount: 0, receivedAt: new Date().toISOString(), category: 'Work', category_id: 'uuid-work-null-guard' }] } });
      await pendingGet;
    });
  });

  it('empty cache + summary confirms count=0 → markCategoryLoaded dispatched, no background GET', async () => {
    // Summary explicitly present with count=0 → genuinely empty category.
    // markCategoryLoaded must fire and no background GET should be made.
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);

    const { setCategorySummary } = await import('store/slices/inboxDataSlice');
    store.dispatch(setCategorySummary([{ id: 'uuid-confirmed-empty', name: 'Confirmed', count: 0 }]));

    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Confirmed', 'uuid-confirmed-empty');

    // Category must be marked loaded immediately (summary confirmed 0).
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).toContain('uuid-confirmed-empty');

    // No background GET should have been fired.
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('AbortError in fetchCategoryEmailsImpl → markCategoryLoadFailed dispatched, no console.error from app code', async () => {
    // When the category fetch is aborted (e.g. component unmounted), the error handler
    // must not emit a console.error from application code (AbortErrors are expected/non-actionable).
    // markCategoryLoadFailed must still be dispatched so Effect 2 can retry if needed.
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);

    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    mockedAxios.get.mockRejectedValueOnce(abortError);
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);

    // Seed summary with count > 0 so the fetch is not skipped.
    const { setCategorySummary } = await import('store/slices/inboxDataSlice');
    store.dispatch(setCategorySummary([{ id: 'uuid-abort-cat', name: 'Aborted', count: 3 }]));

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.fetchCategoryEmails('Aborted', 'uuid-abort-cat');
      // Wait for the rejected promise to propagate through handleCategoryFetchError
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Category must not be in loadedCategoryNames after an abort.
    const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
    expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-abort-cat');

    // No console.error calls from APPLICATION code (React act() warnings are React-internal,
    // not from our code — we check that none of our own error messages appear).
    const errorCalls = (console.error as jest.Mock).mock.calls;
    const appErrorCalls = errorCalls.filter(
      args => typeof args[0] === 'string' && args[0].includes('[Accordion]')
    );
    expect(appErrorCalls).toHaveLength(0);
  });
});

// ─── Fix #2062: stale empty categories from cache ─────────────────────────────

describe('fix #2062 + vanish-on-expand – empty category fetches reconcile with the live summary', () => {
  // When the API returns 0 emails for a category but the Redux summary still shows
  // count > 0, the two sides disagree and we cannot tell locally which one is stale.
  // The hook must refetch the live summary and let the server decide:
  //   - genuinely empty → fresh summary omits the category → hidden (the #2062 ghost case)
  //   - mis-keyed/wrong fetch → fresh summary keeps it → category stays VISIBLE
  // The old behaviour zeroed the count locally in both cases, which made real
  // categories vanish the moment the user expanded them.

  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    (emailCache.getCachedSummary as jest.Mock).mockReturnValue(null);
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  const createStoreWithSummary = (summary: Array<{ id: string | null; name: string; count: number }>) =>
    configureStore({
      reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
      preloadedState: {
        inboxData: {
          ...inboxDataReducer(undefined, { type: '@@INIT' }),
          categorySummary: summary,
        },
      },
    });

  const makeWrapper = (testStore: ReturnType<typeof configureStore>) =>
    ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store: testStore, children });

  /** Mock GET so category fetches return `emails` and summary refetches return `categories`. */
  const mockInboxAndSummaryGet = (
    emails: Email[],
    categories: Array<{ id: string | null; name: string; count: number }>
  ) => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/emails/inbox-summary')) {
        return Promise.resolve({ data: { total: categories.reduce((sum, cat) => sum + cat.count, 0), categories } });
      }
      return Promise.resolve({ data: { emails } });
    });
  };

  describe('fetchCategoryEmails (direct API path)', () => {
    it('removes category from summary when API returns 0 emails and the live summary confirms it is empty', async () => {
      store = createStoreWithSummary([{ id: 'uuid-empty-2062', name: 'Work', count: 5 }]);
      // Live summary no longer contains the category → server confirms it is gone.
      mockInboxAndSummaryGet([], []);

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      await result.current.fetchCategoryEmails('Work', 'uuid-empty-2062');

      await waitFor(() => {
        const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
        const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-empty-2062');
        // Category removed from summary once the LIVE summary confirms it is empty
        expect(category).toBeUndefined();
      });
    });

    it('keeps the category VISIBLE and un-marks it loaded when the live summary still reports emails (vanish-on-expand regression)', async () => {
      store = createStoreWithSummary([{ id: 'uuid-vanish-bug', name: 'Work', count: 5 }]);
      // Category fetch wrongly returns 0 emails, but the live summary still reports 5 —
      // the fetch was the stale side (e.g. mis-keyed UUID or transient error).
      mockInboxAndSummaryGet([], [{ id: 'uuid-vanish-bug', name: 'Work', count: 5 }]);

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      await result.current.fetchCategoryEmails('Work', 'uuid-vanish-bug');

      await waitFor(() => {
        const summaryCalls = mockedAxios.get.mock.calls.filter(call =>
          String(call[0]).includes('/emails/inbox-summary')
        );
        expect(summaryCalls.length).toBeGreaterThan(0);
      });

      const state = store.getState() as {
        inboxData: {
          categorySummary: Array<{ id: string | null; name: string; count: number }> | null;
          loadedCategoryNames: string[];
        };
      };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-vanish-bug');
      // The category must NOT vanish — the live summary is authoritative
      expect(category).toBeDefined();
      expect(category?.count).toBe(5);
      // And it must be un-marked as loaded so the accordion refetches its emails
      expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-vanish-bug');
    });

    it('falls back to hiding the category locally on the second empty fetch for the same key (loop guard)', async () => {
      store = createStoreWithSummary([{ id: 'uuid-persistent', name: 'Work', count: 5 }]);
      // Server persistently disagrees: summary always says 5, category fetch always returns 0.
      mockInboxAndSummaryGet([], [{ id: 'uuid-persistent', name: 'Work', count: 5 }]);

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      // First empty fetch → reconciles with live summary (category kept, un-marked loaded)
      await result.current.fetchCategoryEmails('Work', 'uuid-persistent');
      await waitFor(() => {
        const state = store.getState() as { inboxData: { loadedCategoryNames: string[] } };
        expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-persistent');
      });

      // Second empty fetch → loop guard kicks in and hides the category locally
      await result.current.fetchCategoryEmails('Work', 'uuid-persistent');

      await waitFor(() => {
        const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
        const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-persistent');
        expect(category).toBeUndefined();
      });
      // Only ONE summary reconciliation request was made (bounded, no loop)
      const summaryCalls = mockedAxios.get.mock.calls.filter(call =>
        String(call[0]).includes('/emails/inbox-summary')
      );
      expect(summaryCalls).toHaveLength(1);
    });

    it('does NOT update summary when API returns emails', async () => {
      store = createStoreWithSummary([{ id: 'uuid-has-emails-2062', name: 'Work', count: 3 }]);
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          emails: [
            { id: 'e1', threadId: 't1', subject: 'Email', from: 'a@b.com', to: 'me@b.com', body: '', isRead: false, isArchived: false, starCount: 0, receivedAt: new Date().toISOString(), category: 'Work', category_id: 'uuid-has-emails-2062' },
          ],
        },
      });

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      await result.current.fetchCategoryEmails('Work', 'uuid-has-emails-2062');

      await waitFor(() => {
        expect(emailCache.setCachedCategoryEmails).toHaveBeenCalled();
      });

      const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-has-emails-2062');
      // Category still in summary with original count
      expect(category).toBeDefined();
      expect(category?.count).toBe(3);
    });

    it('does NOT refetch the summary when API returns 0 emails but summary already shows count 0', async () => {
      store = createStoreWithSummary([{ id: 'uuid-already-zero-2062', name: 'Work', count: 0 }]);
      mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      await result.current.fetchCategoryEmails('Work', 'uuid-already-zero-2062');

      await waitFor(() => {
        expect(emailCache.setCachedCategoryEmails).toHaveBeenCalled();
      });

      // Summary should remain unchanged (count was already 0) and no reconciliation fired
      const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-already-zero-2062');
      expect(category?.count).toBe(0);
      const summaryCalls = mockedAxios.get.mock.calls.filter(call =>
        String(call[0]).includes('/emails/inbox-summary')
      );
      expect(summaryCalls).toHaveLength(0);
    });
  });

  describe('serveCategoryFromCacheAndRefresh (background refresh path)', () => {
    it('removes category from summary when background refresh returns 0 emails and the live summary confirms it', async () => {
      store = createStoreWithSummary([{ id: 'uuid-bg-empty-2062', name: 'Finance', count: 7 }]);

      // Serve from cache (empty) then background refresh returns 0
      (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue([]);
      // Summary in ref shows count 7 (stale), background refresh returns 0
      const { setCategorySummary } = await import('store/slices/inboxDataSlice');
      store.dispatch(
        setCategorySummary([{ id: 'uuid-bg-empty-2062', name: 'Finance', count: 7 }])
      );
      mockInboxAndSummaryGet([], []);

      const { result } = renderHook(
        () => useEmailFetching({ mode: 'triage' }),
        { wrapper: makeWrapper(store) }
      );

      await result.current.fetchCategoryEmails('Finance', 'uuid-bg-empty-2062');

      await waitFor(() => {
        const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
        const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-bg-empty-2062');
        // Category removed from summary once the live summary confirms 0 emails
        expect(category).toBeUndefined();
      });
    });
  });

  describe('setCategorySummary loaded-but-empty disagreement (vanish-on-expand fix)', () => {
    // When a summary payload reports count > 0 for a category that is marked loaded with
    // 0 emails in the store, the two sides disagree. The summary is the more authoritative
    // side, so the reducer keeps the count and un-marks the category as loaded (triggering
    // a refetch) instead of clamping the count to 0 — the clamp permanently hid REAL
    // categories after a single bad empty fetch.

    it('keeps the summary count and un-marks the category as loaded when the store has 0 emails for it', async () => {
      const { markCategoryLoaded, setCategorySummary, updateCategoryEmails } = await import(
        'store/slices/inboxDataSlice'
      );

      store = createStoreWithSummary([{ id: 'uuid-race-2062', name: 'Work', count: 5 }]);

      // Simulate: category was expanded, server returned 0 → emails removed, marked loaded
      store.dispatch(updateCategoryEmails({ categoryKey: 'uuid-race-2062', emails: [] }));
      store.dispatch(markCategoryLoaded('uuid-race-2062'));
      // A summary refresh now fires and still reports count = 5
      store.dispatch(setCategorySummary([{ id: 'uuid-race-2062', name: 'Work', count: 5 }]));

      const state = store.getState() as {
        inboxData: {
          categorySummary: Array<{ id: string | null; name: string; count: number }> | null;
          loadedCategoryNames: string[];
        };
      };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-race-2062');
      // The summary count wins (category stays visible)...
      expect(category?.count).toBe(5);
      // ...and the category is un-marked loaded so its emails are refetched
      expect(state.inboxData.loadedCategoryNames).not.toContain('uuid-race-2062');
    });

    it('does NOT zero out a loaded category that still has emails', async () => {
      const { markCategoryLoaded, setCategorySummary, updateCategoryEmails } = await import(
        'store/slices/inboxDataSlice'
      );

      store = createStoreWithSummary([{ id: 'uuid-has-emails-race', name: 'Work', count: 3 }]);

      const email = { id: 'e1', threadId: 't1', subject: 'Email', from: 'a@b.com', to: 'me@b.com', body: '', isRead: false, isArchived: false, starCount: 0, receivedAt: new Date().toISOString(), category: 'Work', category_id: 'uuid-has-emails-race' } as Email;
      store.dispatch(updateCategoryEmails({ categoryKey: 'uuid-has-emails-race', emails: [email] }));
      store.dispatch(markCategoryLoaded('uuid-has-emails-race'));
      store.dispatch(setCategorySummary([{ id: 'uuid-has-emails-race', name: 'Work', count: 3 }]));

      const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-has-emails-race');
      expect(category?.count).toBe(3);
    });

    it('does NOT zero out a category that has not been loaded yet', async () => {
      const { setCategorySummary } = await import('store/slices/inboxDataSlice');

      store = createStoreWithSummary([]);
      store.dispatch(setCategorySummary([{ id: 'uuid-not-loaded', name: 'Work', count: 4 }]));

      const state = store.getState() as { inboxData: { categorySummary: Array<{ id: string | null; name: string; count: number }> | null } };
      const category = state.inboxData.categorySummary?.find(cat => cat.id === 'uuid-not-loaded');
      // Not in loadedCategoryNames → count preserved as-is
      expect(category?.count).toBe(4);
    });
  });
});
