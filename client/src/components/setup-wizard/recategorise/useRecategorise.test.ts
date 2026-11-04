import { act, renderHook } from '@testing-library/react';
import axios from 'axios';

import { MS_PER_MINUTE } from 'constants/numbers';

import { RECATEGORISE_STATUS } from './recategorise';
import { RECATEGORISE_MAX_WAIT_MINUTES, useRecategorise } from './useRecategorise';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const COUNTS = [{ categoryId: null, name: null, count: 0 }];

describe('useRecategorise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: COUNTS });
  });

  it('finishes straight away when the inbox has nothing to re-sort', async () => {
    mockedAxios.post.mockResolvedValue({ data: { batchId: null, queued: 0 } });
    const { result } = renderHook(() => useRecategorise());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe(RECATEGORISE_STATUS.DONE);
    expect(result.current.counts).toEqual(COUNTS);
  });

  it('reports an error when the re-sort cannot be queued', async () => {
    mockedAxios.post.mockRejectedValue(new Error('402'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useRecategorise());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe(RECATEGORISE_STATUS.ERROR);
  });

  it('keeps the changes unsorted after a failed start, so the user can try again', async () => {
    mockedAxios.post.mockRejectedValue(new Error('402'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useRecategorise());

    act(() => result.current.markCategoriesChanged());
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.hasUnsortedCategoryChanges).toBe(true);
  });

  it('reports "still running", not done, when the max wait passes with jobs unfinished', async () => {
    vi.useFakeTimers();
    mockedAxios.post.mockResolvedValue({ data: { batchId: 'batch-1', queued: 2 } });
    mockedAxios.get.mockImplementation(async (url: string) =>
      url.includes('recategorize-progress')
        ? { data: { total: 2, completed: 1, failed: 0, pending: 1 } }
        : { data: COUNTS }
    );
    const { result } = renderHook(() => useRecategorise());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe(RECATEGORISE_STATUS.RUNNING);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECATEGORISE_MAX_WAIT_MINUTES * MS_PER_MINUTE);
    });

    expect(result.current.status).toBe(RECATEGORISE_STATUS.STILL_RUNNING);
    vi.useRealTimers();
  });
});
