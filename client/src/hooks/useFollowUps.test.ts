import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { MAX_BULK_SEND_COUNT, POLLING_INTERVAL_MS, POLLING_TIMEOUT_5_MIN_MS } from 'constants/numbers';
import { FOLLOW_UP_SEND_STATUS_SENT } from 'constants/strings';
import { useFollowUpPolling } from 'hooks/useFollowUpPolling';

import { ThreadWithFollowUp, useFollowUps } from './useFollowUps';

vi.mock('axios');
vi.mock('hooks/useFollowUpPolling', () => ({
  useFollowUpPolling: vi.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseFollowUpPolling = useFollowUpPolling as jest.MockedFunction<typeof useFollowUpPolling>;

describe('useFollowUps', () => {
  const mockStartGenerationPolling = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    console.error = vi.fn();
    // axios.isAxiosError is auto-mocked; restore real behaviour so error narrowing works
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockImplementation(err => err?.isAxiosError === true);
    mockedUseFollowUpPolling.mockReturnValue({
      startGenerationPolling: mockStartGenerationPolling,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useFollowUps());

      expect(result.current.threads).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isGeneratingDrafts).toBe(false);
      expect(result.current.generationProgress.size).toBe(0);
    });
  });

  describe('fetchThreadsWithDrafts', () => {
    it('should fetch threads successfully', async () => {
      const { result } = renderHook(() => useFollowUps());
      const mockThreads = [
        {
          id: 'thread-1',
          subject: 'Test Thread',
          followUp: {
            id: 'followup-1',
            draftFollowUp: 'Draft text',
            generationStatus: 'completed',
          },
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockThreads });

      await act(async () => {
        await result.current.fetchThreadsWithDrafts();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.threads).toEqual(mockThreads);
      expect(result.current.error).toBeNull();
    });

    it('should handle fetch errors', async () => {
      const { result } = renderHook(() => useFollowUps());
      const error = {
        isAxiosError: true,
        response: { data: { message: 'Fetch failed' } },
      };

      mockedAxios.get.mockRejectedValue(error);

      await act(async () => {
        await result.current.fetchThreadsWithDrafts();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Fetch failed');
      expect(result.current.threads).toEqual([]);
    });

    it('should handle errors without response data', async () => {
      const { result } = renderHook(() => useFollowUps());
      // A non-axios Error instance: getAxiosErrorMessage returns err.message
      const error = new Error('Failed to fetch threads');

      mockedAxios.get.mockRejectedValue(error);

      await act(async () => {
        await result.current.fetchThreadsWithDrafts();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch threads');
    });
  });

  describe('generateDrafts', () => {
    it('should generate drafts for threads', async () => {
      const { result } = renderHook(() => useFollowUps());
      const threadIds = ['thread-1', 'thread-2'];

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.generateDrafts(threadIds);
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/follow-ups/generate-drafts-for-threads`, { threadIds });
      expect(mockStartGenerationPolling).toHaveBeenCalled();
    });

    it('should handle generation errors', async () => {
      const { result } = renderHook(() => useFollowUps());
      const error = {
        isAxiosError: true,
        response: { data: { message: 'Generation failed' } },
      };

      mockedAxios.post.mockRejectedValue(error);

      await act(async () => {
        await result.current.generateDrafts(['thread-1']);
      });

      await waitFor(() => {
        expect(result.current.isGeneratingDrafts).toBe(false);
      });

      expect(result.current.error).toBe('Generation failed');
    });
  });

  describe('updateDraft', () => {
    it('should update draft and refresh threads', async () => {
      const { result } = renderHook(() => useFollowUps());
      const followUpId = 'followup-1';
      const draft = 'Updated draft text';

      mockedAxios.put.mockResolvedValue({ data: {} });
      mockedAxios.get.mockResolvedValue({ data: [] });

      await act(async () => {
        await result.current.updateDraft(followUpId, draft);
      });

      expect(mockedAxios.put).toHaveBeenCalledWith(`${API_URL}/follow-ups/${followUpId}/draft`, { draft });
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('should handle update errors', async () => {
      const { result } = renderHook(() => useFollowUps());
      const error = {
        isAxiosError: true,
        response: { data: { message: 'Update failed' } },
      };

      mockedAxios.put.mockRejectedValue(error);

      await expect(result.current.updateDraft('followup-1', 'draft')).rejects.toEqual(error);

      await waitFor(() => {
        expect(result.current.error).toBe('Update failed');
      });
    });
  });

  describe('bulkSend', () => {
    it('should send follow-ups in bulk', async () => {
      const { result } = renderHook(() => useFollowUps());
      const followUpIds = ['followup-1', 'followup-2'];
      const mockResponse = { success: true };

      mockedAxios.post.mockResolvedValue({ data: mockResponse });
      mockedAxios.get.mockResolvedValue({ data: [] });

      await act(async () => {
        const response = await result.current.bulkSend(followUpIds);
        expect(response).toEqual(mockResponse);
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/follow-ups/bulk-send`, { followUpIds });
    });

    it('should throw error when exceeding max bulk send count', async () => {
      const { result } = renderHook(() => useFollowUps());
      const followUpIds = Array.from({ length: MAX_BULK_SEND_COUNT + 1 }, (_, i) => `followup-${i}`);

      await expect(result.current.bulkSend(followUpIds)).rejects.toThrow(
        `Maximum ${MAX_BULK_SEND_COUNT} follow-ups allowed per bulk send`
      );
    });

    it('should poll for send status', async () => {
      const { result } = renderHook(() => useFollowUps());
      const followUpIds = ['followup-1'];
      const threadsWithFollowUps = [
        {
          id: 'thread-1',
          followUp: {
            id: 'followup-1',
            sendStatus: FOLLOW_UP_SEND_STATUS_SENT,
          },
        },
      ];

      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.get.mockResolvedValue({ data: threadsWithFollowUps });

      act(() => {
        result.current.threads.push(...(threadsWithFollowUps as unknown as ThreadWithFollowUp[]));
      });

      await act(async () => {
        await result.current.bulkSend(followUpIds);
      });

      act(() => {
        vi.advanceTimersByTime(POLLING_INTERVAL_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });
    });

    it('should stop polling after timeout', async () => {
      const { result } = renderHook(() => useFollowUps());
      const followUpIds = ['followup-1'];

      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.get.mockResolvedValue({ data: [] });

      await act(async () => {
        await result.current.bulkSend(followUpIds);
      });

      act(() => {
        vi.advanceTimersByTime(POLLING_TIMEOUT_5_MIN_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });
    });

    it('should handle send errors', async () => {
      const { result } = renderHook(() => useFollowUps());
      const error = {
        isAxiosError: true,
        response: { data: { message: 'Send failed' } },
      };

      mockedAxios.post.mockRejectedValue(error);

      await expect(result.current.bulkSend(['followup-1'])).rejects.toEqual(error);

      await waitFor(() => {
        expect(result.current.error).toBe('Send failed');
      });
    });
  });
});
