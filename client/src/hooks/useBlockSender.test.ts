import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';

import { useBlockSender } from './useBlockSender';

vi.mock('axios');
vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

describe('useBlockSender', () => {
  const mockEmails: Email[] = [
    { id: '1', from: 'spam@example.com', subject: 'Spam', receivedAt: '2024-01-01', threadId: 'thread-1' } as Email,
    { id: '2', from: 'good@example.com', subject: 'Good', receivedAt: '2024-01-02', threadId: 'thread-2' } as Email,
  ];

  const mockSetEmails = vi.fn();
  const mockOnHideBlockConfirm = vi.fn();
  const mockFetchEmails = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
    mockFetchEmails.mockResolvedValue(undefined);
  });

  describe('confirmBlockSender', () => {
    it('should do nothing if no email to block', async () => {
      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: null,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockOnHideBlockConfirm).not.toHaveBeenCalled();
    });

    it('should block sender successfully', async () => {
      const blockEmail = mockEmails[0];
      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: blockEmail,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      expect(mockedCaptureEvent).toHaveBeenCalledWith('sender_blocked', {
        email_id: blockEmail.id,
      });
      expect(mockOnHideBlockConfirm).toHaveBeenCalled();
      // setEmails is called with a function for optimistic update
      expect(mockSetEmails).toHaveBeenCalled();
      // Verify the function filters out the blocked email
      const setEmailsCall = mockSetEmails.mock.calls[0][0];
      expect(typeof setEmailsCall).toBe('function');
      const filteredEmails = setEmailsCall(mockEmails);
      expect(filteredEmails).toEqual([mockEmails[1]]);
      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/emails/${blockEmail.id}/block-sender`);
    });

    it('should perform optimistic update', async () => {
      const blockEmail = mockEmails[0];
      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: blockEmail,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      // Should remove email immediately (optimistic update)
      expect(mockSetEmails).toHaveBeenCalledWith(expect.not.arrayContaining([blockEmail]));
    });

    it('should revert on error', async () => {
      const blockEmail = mockEmails[0];
      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: blockEmail,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      const error = new Error('Block failed');
      mockedAxios.post.mockRejectedValue(error);

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      expect(console.error).toHaveBeenCalledWith('Error blocking sender:', error);
      // Should revert by adding email back - setEmails is called with a function
      expect(mockSetEmails).toHaveBeenCalledTimes(2); // Once for optimistic, once for revert
      // Verify the revert function adds the email back
      const revertCall = mockSetEmails.mock.calls[1][0];
      expect(typeof revertCall).toBe('function');
      const revertedEmails = revertCall([mockEmails[1]]); // Simulate state after optimistic removal
      expect(revertedEmails).toContainEqual(blockEmail);
    });

    it('should refresh emails after successful block', async () => {
      const blockEmail = mockEmails[0];
      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: blockEmail,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      await waitFor(() => {
        expect(mockFetchEmails).toHaveBeenCalled();
      });
    });

    it('should handle fetchEmails error gracefully', async () => {
      const blockEmail = mockEmails[0];
      const fetchError = new Error('Fetch failed');
      mockFetchEmails.mockRejectedValue(fetchError);

      const { result } = renderHook(() =>
        useBlockSender({
          emails: mockEmails,
          setEmails: mockSetEmails,
          blockConfirmEmail: blockEmail,
          onHideBlockConfirm: mockOnHideBlockConfirm,
          fetchEmails: mockFetchEmails,
        })
      );

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.confirmBlockSender();
      });

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('Error refreshing after block:', fetchError);
      });
    });
  });
});
