import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';

import { usePriorityCounts } from './usePriorityCounts';

vi.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('usePriorityCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  it('fetches priority counts from the correct endpoint with default triage mode', async () => {
    const mockCounts = { veryHigh: 2, high: 5, medium: 10, low: 3, veryLow: 1 };
    mockedAxios.get.mockResolvedValue({ data: mockCounts });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.counts).toEqual(mockCounts);
    });

    // Fix #1452 bug 3: mode param is passed so bucket counts match the inbox tab total.
    expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/priority-counts`, { params: { mode: 'triage' } });
  });

  it('passes the given mode as a query param', async () => {
    mockedAxios.get.mockResolvedValue({ data: { veryHigh: 0, high: 1, medium: 0, low: 0, veryLow: 0 } });

    const { result } = renderHook(() => usePriorityCounts('action'));

    await waitFor(() => {
      expect(result.current.counts?.high).toBe(1);
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/priority-counts`, { params: { mode: 'action' } });
  });

  it('starts with null counts and isLoading true', () => {
    mockedAxios.get.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => usePriorityCounts());

    expect(result.current.counts).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns null counts on fetch error (graceful degradation)', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.counts).toBeNull();
  });

  it('sets isLoading to false after successful fetch', async () => {
    mockedAxios.get.mockResolvedValue({ data: { veryHigh: 0, high: 1, medium: 2, low: 0, veryLow: 0 } });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('fetchCounts re-fetches and updates counts', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { veryHigh: 2, high: 5, medium: 10, low: 3, veryLow: 1 } })
      .mockResolvedValueOnce({ data: { veryHigh: 0, high: 0, medium: 8, low: 3, veryLow: 0 } });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.counts?.high).toBe(5);
    });

    await act(async () => {
      await result.current.fetchCounts();
    });

    expect(result.current.counts).toEqual({ veryHigh: 0, high: 0, medium: 8, low: 3, veryLow: 0 });
  });
});
