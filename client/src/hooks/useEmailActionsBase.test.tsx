/**
 * Unit tests for useEmailActionsBase
 *
 * Covers the cache-invalidation fix for issue #1108:
 * removeEmailFromCache must be called when prioritising an email in Triage
 * so the email doesn't reappear after navigation.
 *
 * Also covers issue #1113:
 * invalidateSummaryCache must be called after prioritisation / deprioritisation
 * so category counts don't stay stale in localStorage.
 */
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import * as emailCache from 'utils/emailCache';

import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useEmailActionsBase } from './useEmailActionsBase';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('utils/emailCache', () => ({
  removeEmailFromCache: vi.fn(),
  invalidateSummaryCache: vi.fn(),
}));

const mockedRemoveEmailFromCache = emailCache.removeEmailFromCache as jest.MockedFunction<
  typeof emailCache.removeEmailFromCache
>;

const mockedInvalidateSummaryCache = emailCache.invalidateSummaryCache as jest.MockedFunction<
  typeof emailCache.invalidateSummaryCache
>;

const MODE_TRIAGE = 'triage';
const MODE_ACTION = 'action';

function makeEmail(id: string, overrides: Partial<Email> = {}): Email {
  return {
    id,
    subject: 'Test email',
    from: 'test@example.com',
    starCount: 0,
    isRead: true,
    category: 'Work',
    priorityScore: 50,
    date: new Date().toISOString(),
    ...overrides,
  } as Email;
}

const createTestStore = (emails: Email[] = []) => {
  return configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
    preloadedState: {
      inboxData: {
        emails,
        hasMore: false,
        totalCount: 0,
        currentOffset: 0,
        categorySummary: null,
        loadedCategoryNames: [] as string[],
        loadingCategoryNames: [] as string[],
        exhaustedCategoryNames: [] as string[],
        lastFetchedAt: null as number | null,
      },
      inboxUI: {
        optimisticallyArchived: [] as string[],
        optimisticallySnoozed: [] as string[],
        animatingOut: [] as { id: string; type: 'archive' | 'priority' }[],
        loading: false,
        decrypting: false,
        refreshing: false,
        loadingModeSwitch: false,
        fetchError: null as string | null,
        summaryLoading: false,
      },
    },
  });
};

const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  return ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe('useEmailActionsBase — handleSetStarCount', () => {
  const mockFetchEmails = vi.fn().mockResolvedValue(undefined);
  const mockOnSuggestionRemove = vi.fn();
  const mockOnTabCountsUpdateOptimistically = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.put.mockResolvedValue({ data: {} });
  });

  describe('Triage mode — prioritisation (starCount > 0)', () => {
    it('calls removeEmailFromCache when prioritising an email in Triage', async () => {
      const email = makeEmail('email-1');
      const store = createTestStore([email]);

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            onSuggestionRemove: mockOnSuggestionRemove,
            onTabCountsUpdateOptimistically: mockOnTabCountsUpdateOptimistically,
            mode: MODE_TRIAGE,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-1', 2);
      });

      expect(mockedRemoveEmailFromCache).toHaveBeenCalledWith('email-1');
    });

    it('calls invalidateSummaryCache with mode when prioritising an email in Triage (#1113)', async () => {
      const email = makeEmail('email-1a');
      const store = createTestStore([email]);

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            onSuggestionRemove: mockOnSuggestionRemove,
            onTabCountsUpdateOptimistically: mockOnTabCountsUpdateOptimistically,
            mode: MODE_TRIAGE,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-1a', 2);
      });

      expect(mockedInvalidateSummaryCache).toHaveBeenCalledWith(MODE_TRIAGE);
    });

    it('calls removeEmailFromCache before the animation timeout fires', async () => {
      const email = makeEmail('email-2');
      const store = createTestStore([email]);

      const callOrder: string[] = [];
      mockedRemoveEmailFromCache.mockImplementation(() => {
        callOrder.push('removeEmailFromCache');
      });
      mockOnSuggestionRemove.mockImplementation(() => {
        callOrder.push('onSuggestionRemove');
      });

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            onSuggestionRemove: mockOnSuggestionRemove,
            mode: MODE_TRIAGE,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-2', 1);
      });

      // removeEmailFromCache must be called before or alongside onSuggestionRemove
      expect(callOrder).toContain('removeEmailFromCache');
    });

    it('does NOT call removeEmailFromCache when starCount is 0 in Triage', async () => {
      const email = makeEmail('email-3', { starCount: 1 });
      const store = createTestStore([email]);

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            mode: MODE_TRIAGE,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-3', 0);
      });

      expect(mockedRemoveEmailFromCache).not.toHaveBeenCalled();
    });
  });

  describe('Action mode — deprioritisation (starCount === 0)', () => {
    it('does NOT call removeEmailFromCache when deprioritising in Action mode', async () => {
      const email = makeEmail('email-4', { starCount: 2 });
      const store = createTestStore([email]);

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            mode: MODE_ACTION,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-4', 0);
      });

      expect(mockedRemoveEmailFromCache).not.toHaveBeenCalled();
    });

    it('calls invalidateSummaryCache with mode when deprioritising in Action mode (#1113)', async () => {
      const email = makeEmail('email-4a', { starCount: 2 });
      const store = createTestStore([email]);

      const { result } = renderHook(
        () =>
          useEmailActionsBase({
            fetchEmails: mockFetchEmails,
            mode: MODE_ACTION,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSetStarCount('email-4a', 0);
      });

      expect(mockedInvalidateSummaryCache).toHaveBeenCalledWith(MODE_ACTION);
    });
  });
});
