import { act, renderHook } from '@testing-library/react';
import axios from 'axios';

import { useCategorisationProgress } from './useCategorisationProgress';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const POLL_MS = 10000;

describe('useCategorisationProgress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('notices the sort queued as learning finishes, instead of trusting the earlier count', async () => {
    let server = { total: 100, categorised: 100 };
    mockedAxios.get.mockImplementation(async () => ({ data: server }));
    const { result, rerender } = renderHook(({ isDone }) => useCategorisationProgress(isDone), {
      initialProps: { isDone: false },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.progress?.categorised).toBe(100);

    server = { total: 100, categorised: 0 };
    rerender({ isDone: true });
    expect(result.current.progress).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.progress?.categorised).toBe(0);
  });

  it('stops polling once a count taken after learning finished says everything is sorted', async () => {
    mockedAxios.get.mockResolvedValue({ data: { total: 100, categorised: 100 } });
    const { result, rerender } = renderHook(({ isDone }) => useCategorisationProgress(isDone), {
      initialProps: { isDone: false },
    });
    rerender({ isDone: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.progress?.categorised).toBe(100);

    const callsWhenSettled = mockedAxios.get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(callsWhenSettled);
  });
});
