import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';

import { useEmailDetail } from './useEmailDetail';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('useEmailDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  describe('initialization', () => {
    it('should initialize with loading state', () => {
      mockedAxios.get.mockResolvedValue({ data: { id: '1', subject: 'Test' } });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.email).toBeNull();
      expect(result.current.threadEmails).toEqual([]);
      expect(result.current.expandedThreadItems.size).toBe(0);
    });
  });

  describe('fetchEmail', () => {
    it('should fetch email successfully', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test Email',
        from: 'test@example.com',
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.email).toEqual(mockEmail);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/email-1`);
    });

    it('should fetch thread emails when email has threadId', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test Email',
      };
      const mockThreadEmails = [
        { id: 'email-1', subject: 'Test Email' },
        { id: 'email-2', subject: 'Re: Test Email' },
      ];

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail }).mockResolvedValueOnce({ data: mockThreadEmails });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.threadEmails).toEqual(mockThreadEmails);
      expect(result.current.expandedThreadItems.has('email-1')).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/thread/thread-1`);
    });

    it('should not fetch thread if email has no threadId', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Email',
        // No threadId
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.threadEmails).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should handle fetch error gracefully', async () => {
      const error = new Error('Failed to fetch');
      mockedAxios.get.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.email).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching email:', error);
    });

    it('should handle thread fetch error gracefully', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test Email',
      };
      const threadError = new Error('Failed to fetch thread');

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail }).mockRejectedValueOnce(threadError);

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.email).toEqual(mockEmail);
      expect(result.current.threadEmails).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error fetching thread:', threadError);
    });
  });

  describe('toggleThreadItem', () => {
    it('should expand thread item when collapsed', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test',
      };
      const mockThreadEmails = [
        { id: 'email-1', subject: 'Test' },
        { id: 'email-2', subject: 'Re: Test' },
      ];

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail }).mockResolvedValueOnce({ data: mockThreadEmails });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially email-1 is expanded
      expect(result.current.expandedThreadItems.has('email-1')).toBe(true);

      // Toggle to collapse
      act(() => {
        result.current.toggleThreadItem('email-1');
      });
      expect(result.current.expandedThreadItems.has('email-1')).toBe(false);

      // Toggle to expand again
      act(() => {
        result.current.toggleThreadItem('email-1');
      });
      expect(result.current.expandedThreadItems.has('email-1')).toBe(true);
    });

    it('should add new thread item to expanded set', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test',
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Expand a different email
      act(() => {
        result.current.toggleThreadItem('email-2');
      });
      expect(result.current.expandedThreadItems.has('email-2')).toBe(true);
      expect(result.current.expandedThreadItems.size).toBe(1);
    });

    it('should handle multiple expanded items', async () => {
      const mockEmail = {
        id: 'email-1',
        threadId: 'thread-1',
        subject: 'Test',
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail });

      const { result } = renderHook(() => useEmailDetail('email-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.toggleThreadItem('email-2');
        result.current.toggleThreadItem('email-3');
        result.current.toggleThreadItem('email-4');
      });

      expect(result.current.expandedThreadItems.size).toBe(3);
      expect(result.current.expandedThreadItems.has('email-2')).toBe(true);
      expect(result.current.expandedThreadItems.has('email-3')).toBe(true);
      expect(result.current.expandedThreadItems.has('email-4')).toBe(true);
    });
  });

  describe('emailId changes', () => {
    it('should refetch when emailId changes', async () => {
      const mockEmail1 = { id: 'email-1', subject: 'Email 1' };
      const mockEmail2 = { id: 'email-2', subject: 'Email 2' };

      mockedAxios.get.mockResolvedValueOnce({ data: mockEmail1 }).mockResolvedValueOnce({ data: mockEmail2 });

      const { result, rerender } = renderHook(({ emailId }) => useEmailDetail(emailId), {
        initialProps: { emailId: 'email-1' },
      });

      await waitFor(() => {
        expect(result.current.email).toEqual(mockEmail1);
      });

      rerender({ emailId: 'email-2' });

      await waitFor(() => {
        expect(result.current.email).toEqual(mockEmail2);
      });

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});
