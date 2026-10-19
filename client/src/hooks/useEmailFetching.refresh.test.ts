/**
 * Background refresh (processing poll / cache revalidation) must only fetch what the user can
 * see: one summary request plus ONE /emails/inbox-batch request for the open accordions —
 * not one /emails/inbox request per loaded category every 10s.
 */
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import * as emailCache from 'utils/emailCache';

import { CATEGORY_PAGE_SIZE, INBOX_BATCH_MAX_CATEGORIES } from 'constants/numbers';
import { MODE_TRIAGE } from 'constants/strings';
import categoryReducer from 'store/slices/categorySlice';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { buildCategoryParamsImpl, useEmailFetching } from './useEmailFetching';

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
const BATCH_PATH = '/emails/inbox-batch';
const SINGLE_CATEGORY_PATH = '/emails/inbox?';

const makeEmail = (categoryKey: string, index: number, isProcessingPriority = false): Email =>
  ({
    id: `${categoryKey}-e${index}`,
    threadId: `${categoryKey}-t${index}`,
    category_id: categoryKey,
    category: `Name ${categoryKey}`,
    isArchived: false,
    isProcessingPriority,
  }) as unknown as Email;

const makeRows = (categoryKey: string, count: number): Email[] =>
  Array.from({ length: count }, (_, index) => makeEmail(categoryKey, index));

const categoryKeys = (count: number) => Array.from({ length: count }, (_, index) => `cat-${index}`);

function makeStore({
  loadedKeys,
  expandedKeys,
  loadingKeys = [],
  rowsPerCategory = 2,
}: {
  loadedKeys: string[];
  expandedKeys: string[];
  loadingKeys?: string[];
  rowsPerCategory?: number;
}) {
  const baseInboxData = inboxDataReducer(undefined, { type: '@@INIT' });
  const baseCategory = categoryReducer(undefined, { type: '@@INIT' });
  return configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer, category: categoryReducer },
    preloadedState: {
      inboxData: {
        ...baseInboxData,
        emails: loadedKeys.flatMap(key => makeRows(key, rowsPerCategory)),
        categorySummary: loadedKeys.map(key => ({ id: key, name: `Name ${key}`, count: rowsPerCategory })),
        loadedCategoryNames: loadedKeys,
        loadingCategoryNames: loadingKeys,
      },
      category: { ...baseCategory, expandedKeys },
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

/** Answers summary/batch/single-category GETs from the store's own categories. */
function mockInboxApi(store: TestStore) {
  mockedAxios.get.mockImplementation((url: string) => {
    if (url.includes(SUMMARY_PATH)) {
      const categories = store.getState().inboxData.categorySummary ?? [];
      return Promise.resolve({ data: { total: categories.length, categories } });
    }
    if (url.includes(BATCH_PATH)) {
      const params = new URLSearchParams(url.split('?')[1]);
      const keys = (params.get('categoryIds') ?? '').split(',');
      return Promise.resolve({
        data: { categories: keys.map(key => ({ key, emails: makeRows(key, 2), total: 2, hasMore: false })) },
      });
    }
    return Promise.resolve({ data: { emails: [], total: 0, hasMore: false } });
  });
}

const callsTo = (path: string) =>
  mockedAxios.get.mock.calls.filter(([url]) => String(url).includes(path)).map(([url]) => String(url));

function renderFetching(store: TestStore) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  return renderHook(() => useEmailFetching({ mode: MODE_TRIAGE }), { wrapper: Wrapper });
}

describe('refreshInPlace — refreshes only visible categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
  });

  it('sends one summary + one batch request for the open accordions, regardless of how many are loaded', async () => {
    const loadedKeys = categoryKeys(12);
    const store = makeStore({ loadedKeys, expandedKeys: ['cat-0', 'cat-1'] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(callsTo(SUMMARY_PATH)).toHaveLength(1);
    expect(callsTo(SINGLE_CATEGORY_PATH)).toHaveLength(0);
    const [batchUrl] = callsTo(BATCH_PATH);
    expect(new URLSearchParams(batchUrl.split('?')[1]).get('categoryIds')).toBe('cat-0,cat-1');
  });

  it('marks collapsed loaded categories stale (kept rows, refetched on next expand) instead of fetching them', async () => {
    const store = makeStore({ loadedKeys: ['cat-0', 'cat-1', 'cat-2'], expandedKeys: ['cat-0'] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    const { loadedCategoryNames, emails } = store.getState().inboxData;
    expect(loadedCategoryNames).toEqual(['cat-0']);
    // Rows of the collapsed categories are kept so a re-expand shows them while revalidating.
    expect(emails.filter(email => email.category_id === 'cat-2')).toHaveLength(2);
  });

  it('sends only the summary request when no accordion is open', async () => {
    const store = makeStore({ loadedKeys: categoryKeys(4), expandedKeys: [] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(callsTo(SUMMARY_PATH)).toHaveLength(1);
  });

  it('splits open accordions into batches no larger than the server cap', async () => {
    const loadedKeys = categoryKeys(INBOX_BATCH_MAX_CATEGORIES + 2);
    const store = makeStore({ loadedKeys, expandedKeys: loadedKeys });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    const batchKeyCounts = callsTo(BATCH_PATH).map(
      url => (new URLSearchParams(url.split('?')[1]).get('categoryIds') ?? '').split(',').length
    );
    expect(batchKeyCounts).toEqual([INBOX_BATCH_MAX_CATEGORIES, 2]);
  });

  it('skips a category whose expand fetch is already in flight', async () => {
    const store = makeStore({ loadedKeys: ['cat-0', 'cat-1'], expandedKeys: ['cat-0', 'cat-1'], loadingKeys: ['cat-1'] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    const [batchUrl] = callsTo(BATCH_PATH);
    expect(new URLSearchParams(batchUrl.split('?')[1]).get('categoryIds')).toBe('cat-0');
  });

  it('joins a refresh already in flight instead of stacking a second round of requests', async () => {
    const store = makeStore({ loadedKeys: ['cat-0'], expandedKeys: ['cat-0'] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await Promise.all([result.current.refreshInPlace(), result.current.refreshInPlace()]);
    });

    expect(callsTo(SUMMARY_PATH)).toHaveLength(1);
    expect(callsTo(BATCH_PATH)).toHaveLength(1);

    // Once it settles, the next tick refreshes again.
    await act(async () => {
      await result.current.refreshInPlace();
    });
    expect(callsTo(SUMMARY_PATH)).toHaveLength(2);
  });

  it('asks for enough rows to cover a category the user paged into, so the refresh does not truncate it', async () => {
    const pagedRows = CATEGORY_PAGE_SIZE + 10;
    const store = makeStore({ loadedKeys: ['cat-0'], expandedKeys: ['cat-0'], rowsPerCategory: pagedRows });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    const [batchUrl] = callsTo(BATCH_PATH);
    expect(new URLSearchParams(batchUrl.split('?')[1]).get('limit')).toBe(String(CATEGORY_PAGE_SIZE * 2));
  });

  it('records the server paging state for refreshed categories', async () => {
    const store = makeStore({ loadedKeys: ['cat-0'], expandedKeys: ['cat-0'] });
    mockInboxApi(store);
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.refreshInPlace();
    });

    expect(store.getState().inboxData.categoryPagination['cat-0']).toEqual({ total: 2, hasMore: false });
  });
});

describe('category first page', () => {
  it('requests CATEGORY_PAGE_SIZE rows from offset 0 by default', () => {
    const params = buildCategoryParamsImpl(MODE_TRIAGE, undefined, 'cat-0');
    expect(params.get('limit')).toBe(String(CATEGORY_PAGE_SIZE));
    expect(params.get('offset')).toBe('0');
  });

  it('requests an explicit page for "Show more"', () => {
    const params = buildCategoryParamsImpl(MODE_TRIAGE, undefined, 'cat-0', { offset: 50, limit: 50 });
    expect(params.get('offset')).toBe('50');
  });

  it('records hasMore/total from a single-category fetch', async () => {
    vi.mocked(emailCache.getCachedCategoryEmails).mockReturnValue(null);
    const store = makeStore({ loadedKeys: [], expandedKeys: [] });
    store.dispatch({
      type: 'inboxData/setCategorySummary',
      payload: [{ id: 'cat-9', name: 'Name cat-9', count: 120 }],
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: makeRows('cat-9', CATEGORY_PAGE_SIZE), total: 120, hasMore: true } });
    const { result } = renderFetching(store);

    await act(async () => {
      await result.current.fetchCategoryEmails('Name cat-9', 'cat-9');
    });

    expect(store.getState().inboxData.categoryPagination['cat-9']).toEqual({ total: 120, hasMore: true });
    const [url] = mockedAxios.get.mock.calls[0];
    expect(new URLSearchParams(String(url).split('?')[1]).get('limit')).toBe(String(CATEGORY_PAGE_SIZE));
  });
});
