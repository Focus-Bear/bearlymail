/**
 * #453: ticking priority boxes quickly sends several /emails/inbox-summary requests. Whichever
 * answer arrived last used to win, so an older filter's counts could replace the newer one's
 * and the category numbers flickered. Only the newest request may update the screen.
 */
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import axios from 'axios';
import * as emailCache from 'utils/emailCache';

import { MODE_TRIAGE } from 'constants/strings';
import categoryReducer from 'store/slices/categorySlice';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useEmailFetching } from './useEmailFetching';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('utils/emailCache', () => ({
  clearCacheForMode: vi.fn(),
  filterHash: vi.fn(() => 'hash'),
  getCachedCategoryEmails: vi.fn().mockReturnValue(null),
  getCachedSummary: vi.fn().mockReturnValue(null),
  setCachedCategoryEmails: vi.fn(),
  setCachedSummary: vi.fn(),
}));

const SUMMARY_PATH = '/emails/inbox-summary';
const HIGH_AND_ABOVE = { minPriority: 60, maxPriority: 100 };
const VERY_LOW_ONLY = { minPriority: 0, maxPriority: 19 };

const summaryFor = (count: number) => ({
  total: count,
  categories: [{ id: 'cat-orders', name: 'Order Tracking', count }],
});
const OLD_SUMMARY = summaryFor(18);
const NEW_SUMMARY = summaryFor(463);

const NO_MAILBOX_ERROR = { response: { status: 403, data: { error: 'EMAIL_PROVIDER_REQUIRED' } } };

interface PendingRequest {
  url: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** Holds every summary request open until the test answers it, so answers can arrive out of order. */
function holdSummaryRequests(): PendingRequest[] {
  const pending: PendingRequest[] = [];
  mockedAxios.get.mockImplementation((url: string) => {
    if (url.includes(SUMMARY_PATH)) {
      return new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
    }
    return Promise.resolve({ data: { categories: [], emails: [], total: 0, hasMore: false } });
  });
  return pending;
}

function makeStore() {
  return configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer, category: categoryReducer },
  });
}

type TestStore = ReturnType<typeof makeStore>;

function renderFetching(store: TestStore) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  return renderHook(() => useEmailFetching({ mode: MODE_TRIAGE }), { wrapper: Wrapper });
}

const shownCount = (store: TestStore) => store.getState().inboxData.categorySummary?.[0]?.count;

describe('useEmailFetching — a slow answer for an older filter (#453)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
    // The config resets mocks between tests; no cached summary means every fetch hits the API.
    vi.mocked(emailCache.getCachedSummary).mockReturnValue(null);
    vi.mocked(emailCache.getCachedCategoryEmails).mockReturnValue(null);
  });

  it('keeps the newer filter counts when the older filter answers last', async () => {
    const pending = holdSummaryRequests();
    const store = makeStore();
    const { result } = renderFetching(store);

    await act(async () => {
      const older = result.current.fetchEmails(HIGH_AND_ABOVE);
      const newer = result.current.fetchEmails(VERY_LOW_ONLY);
      expect(pending).toHaveLength(2);
      pending[1].resolve({ data: NEW_SUMMARY });
      await newer;
      pending[0].resolve({ data: OLD_SUMMARY });
      await older;
    });

    expect(shownCount(store)).toBe(NEW_SUMMARY.total);
    expect(store.getState().inboxData.totalCount).toBe(NEW_SUMMARY.total);
  });

  it('still shows the summary when only one filter is in flight', async () => {
    const pending = holdSummaryRequests();
    const store = makeStore();
    const { result } = renderFetching(store);

    await act(async () => {
      const only = result.current.fetchEmails(VERY_LOW_ONLY);
      pending[0].resolve({ data: NEW_SUMMARY });
      await only;
    });

    expect(shownCount(store)).toBe(NEW_SUMMARY.total);
    expect(store.getState().inboxUI.decrypting).toBe(false);
  });

  it('ignores a failure from the older filter once the newer one has loaded', async () => {
    const pending = holdSummaryRequests();
    const store = makeStore();
    const { result } = renderFetching(store);

    await act(async () => {
      const older = result.current.fetchEmails(HIGH_AND_ABOVE);
      const newer = result.current.fetchEmails(VERY_LOW_ONLY);
      pending[1].resolve({ data: NEW_SUMMARY });
      await newer;
      pending[0].reject(NO_MAILBOX_ERROR);
      await older;
    });

    expect(store.getState().inboxUI.fetchError).toBeNull();
    expect(shownCount(store)).toBe(NEW_SUMMARY.total);
  });

  it('keeps the newer filter counts when a background refresh from before the change lands late', async () => {
    const pending = holdSummaryRequests();
    const store = makeStore();
    const { result } = renderFetching(store);

    await act(async () => {
      const refresh = result.current.refreshInPlace();
      const newer = result.current.fetchEmails(VERY_LOW_ONLY);
      pending[1].resolve({ data: NEW_SUMMARY });
      await newer;
      pending[0].resolve({ data: OLD_SUMMARY });
      await refresh;
    });

    expect(shownCount(store)).toBe(NEW_SUMMARY.total);
  });
});
