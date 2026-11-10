import { act, renderHook } from '@testing-library/react';
import axios from 'axios';
import {
  BACKGROUND_SORTING_MAX_WATCH_MINUTES,
  isWatchingBackgroundSorting,
  markBackgroundSortingStarted,
} from 'utils/backgroundSorting';

import { BACKGROUND_SORTING_POLL_MS, useBackgroundSortingProgress } from './useBackgroundSortingProgress';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const MS_PER_MINUTE = 60_000;

async function flushPoll(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useBackgroundSortingProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockedAxios.get.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('shows nothing (and polls nothing) for a user who never left onboarding mid-sort', async () => {
    const { result } = renderHook(() => useBackgroundSortingProgress());
    await flushPoll(BACKGROUND_SORTING_POLL_MS);

    expect(result.current).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('keeps following the sort after the user leaves the categorise step', async () => {
    let server = { total: 400, categorised: 50 };
    mockedAxios.get.mockImplementation(async () => ({ data: server }));
    markBackgroundSortingStarted();

    const { result } = renderHook(() => useBackgroundSortingProgress());
    await flushPoll();
    expect(result.current).toEqual({ total: 400, categorised: 50 });

    server = { total: 400, categorised: 220 };
    await flushPoll(BACKGROUND_SORTING_POLL_MS);
    expect(result.current).toEqual({ total: 400, categorised: 220 });
  });

  it('hides itself and stops polling once everything is sorted', async () => {
    mockedAxios.get.mockResolvedValue({ data: { total: 400, categorised: 400 } });
    markBackgroundSortingStarted();

    const { result } = renderHook(() => useBackgroundSortingProgress());
    await flushPoll();
    const callsWhenDone = mockedAxios.get.mock.calls.length;
    await flushPoll(BACKGROUND_SORTING_POLL_MS * 3);

    expect(result.current).toBeNull();
    expect(mockedAxios.get).toHaveBeenCalledTimes(callsWhenDone);
    expect(isWatchingBackgroundSorting()).toBe(false);
  });

  it('never blocks the inbox when the progress request fails, and recovers on the next poll', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ data: { total: 400, categorised: 90 } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    markBackgroundSortingStarted();

    const { result } = renderHook(() => useBackgroundSortingProgress());
    await flushPoll();
    expect(result.current).toBeNull();

    await flushPoll(BACKGROUND_SORTING_POLL_MS);
    expect(result.current).toEqual({ total: 400, categorised: 90 });
    consoleError.mockRestore();
  });

  it('stops showing a sort that started too long ago to still be running', async () => {
    markBackgroundSortingStarted(Date.now() - (BACKGROUND_SORTING_MAX_WATCH_MINUTES + 1) * MS_PER_MINUTE);

    const { result } = renderHook(() => useBackgroundSortingProgress());
    await flushPoll(BACKGROUND_SORTING_POLL_MS);

    expect(result.current).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
