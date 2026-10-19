import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';

import { CATEGORY_PAGE_SIZE, INBOX_FETCH_LIMIT } from 'constants/numbers';
import { MODE_TRIAGE } from 'constants/strings';
import inboxDataReducer, { setCategoryPagination } from 'store/slices/inboxDataSlice';

import { countUnloadedRows, useCategoryPagination } from './useCategoryPagination';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const CATEGORY_KEY = 'cat-1';
const rows = (from: number, count: number): Email[] =>
  Array.from(
    { length: count },
    (_, index) => ({ id: `e${from + index}`, category_id: CATEGORY_KEY, isArchived: false }) as unknown as Email
  );

function setup(loadedCount: number, total: number) {
  const store = configureStore({ reducer: { inboxData: inboxDataReducer } });
  store.dispatch({ type: 'inboxData/setEmails', payload: rows(0, loadedCount) });
  store.dispatch(setCategoryPagination({ categoryKey: CATEGORY_KEY, total, hasMore: loadedCount < total }));
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  const hook = renderHook(() => useCategoryPagination({ mode: MODE_TRIAGE, categoryKey: CATEGORY_KEY, loadedCount }), {
    wrapper: Wrapper,
  });
  return { ...hook, store };
}

const paramsOf = (callIndex: number) =>
  new URLSearchParams(String(mockedAxios.get.mock.calls[callIndex][0]).split('?')[1]);

describe('countUnloadedRows', () => {
  it('is zero without further pages and the remainder otherwise', () => {
    expect(countUnloadedRows(undefined, 10)).toBe(0);
    expect(countUnloadedRows({ total: 10, hasMore: false }, 10)).toBe(0);
    expect(countUnloadedRows({ total: 120, hasMore: true }, 50)).toBe(70);
  });
});

describe('useCategoryPagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the rows still to load', () => {
    const { result } = setup(CATEGORY_PAGE_SIZE, 120);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remainingCount).toBe(120 - CATEGORY_PAGE_SIZE);
  });

  it('loads the next page from the current offset and appends it', async () => {
    const { result, store } = setup(CATEGORY_PAGE_SIZE, 120);
    mockedAxios.get.mockResolvedValueOnce({
      data: { emails: rows(CATEGORY_PAGE_SIZE, CATEGORY_PAGE_SIZE), total: 120, hasMore: true },
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(paramsOf(0).get('offset')).toBe(String(CATEGORY_PAGE_SIZE));
    expect(paramsOf(0).get('limit')).toBe(String(CATEGORY_PAGE_SIZE));
    expect(store.getState().inboxData.emails).toHaveLength(CATEGORY_PAGE_SIZE * 2);
    expect(store.getState().inboxData.categoryPagination[CATEGORY_KEY]).toEqual({ total: 120, hasMore: true });
  });

  it('collapses rapid repeat clicks into one request', async () => {
    const { result } = setup(CATEGORY_PAGE_SIZE, 120);
    mockedAxios.get.mockResolvedValue({ data: { emails: [], total: 120, hasMore: false } });

    await act(async () => {
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('fetches the IDs of every unloaded row for Archive All', async () => {
    const { result } = setup(CATEGORY_PAGE_SIZE, CATEGORY_PAGE_SIZE + 2);
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: rows(CATEGORY_PAGE_SIZE, 2), total: 52, hasMore: false } });

    let ids: string[] = [];
    await act(async () => {
      ids = await result.current.fetchUnloadedIds();
    });

    expect(ids).toEqual([`e${CATEGORY_PAGE_SIZE}`, `e${CATEGORY_PAGE_SIZE + 1}`]);
    expect(paramsOf(0).get('offset')).toBe(String(CATEGORY_PAGE_SIZE));
    expect(paramsOf(0).get('limit')).toBe(String(INBOX_FETCH_LIMIT));
  });

  it('makes no request for unloaded IDs when everything is loaded', async () => {
    const { result } = setup(2, 2);
    await act(async () => {
      expect(await result.current.fetchUnloadedIds()).toEqual([]);
    });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
