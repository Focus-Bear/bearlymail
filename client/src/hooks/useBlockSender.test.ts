/* eslint-disable id-denylist -- 'data' is a standard property name for axios responses */
import { renderHook, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { useBlockSender } from './useBlockSender';
import { captureEvent } from 'utils/posthog';
import { Email } from 'types/email';

jest.mock('axios');
jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

describe('useBlockSender', () => {
  const mockEmails: Email[] = [
    { id: '1', from: 'spam@example.com', subject: 'Spam', receivedAt: '2024-01-01' } as Email,
    { id: '2', from: 'good@example.com', subject: 'Good', receivedAt: '2024-01-02' } as Email,
  ];

  const mockSetEmails = jest.fn();
  const mockOnHideBlockConfirm = jest.fn();
  const mockFetchEmails = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
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
      expect(mockSetEmails).toHaveBeenCalledWith(
        expect.arrayContaining([mockEmails[1]])
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/emails/${blockEmail.id}/block-sender`
      );
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
      expect(mockSetEmails).toHaveBeenCalledWith(
        expect.not.arrayContaining([blockEmail])
      );
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
      // Should revert by adding email back
      expect(mockSetEmails).toHaveBeenCalledWith(
        expect.arrayContaining([blockEmail])
      );
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
        expect(console.error).toHaveBeenCalledWith(
          'Error refreshing after block:',
          fetchError
        );
      });
    });
  });
});



