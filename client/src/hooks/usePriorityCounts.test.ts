import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';

import { usePriorityCounts } from './usePriorityCounts';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('usePriorityCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  it('fetches priority counts from the correct endpoint on mount', async () => {
    const mockCounts = { high: 5, medium: 10, low: 3 };
    mockedAxios.get.mockResolvedValue({ data: mockCounts });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.counts).toEqual(mockCounts);
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/priority-counts`);
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
    mockedAxios.get.mockResolvedValue({ data: { high: 1, medium: 2, low: 0 } });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('fetchCounts re-fetches and updates counts', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { high: 5, medium: 10, low: 3 } })
      .mockResolvedValueOnce({ data: { high: 0, medium: 8, low: 3 } });

    const { result } = renderHook(() => usePriorityCounts());

    await waitFor(() => {
      expect(result.current.counts?.high).toBe(5);
    });

    await act(async () => {
      await result.current.fetchCounts();
    });

    expect(result.current.counts).toEqual({ high: 0, medium: 8, low: 3 });
  });
});
