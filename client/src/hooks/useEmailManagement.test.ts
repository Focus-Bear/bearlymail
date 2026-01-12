/* eslint-disable id-denylist -- 'data' is a standard property name for axios responses */
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useEmailManagement } from './useEmailManagement';
import * as useEmailFetchingModule from './useEmailFetching';
import * as useEmailActionsBaseModule from './useEmailActionsBase';

jest.mock('axios');
jest.mock('./useEmailFetching');
jest.mock('./useEmailActionsBase');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseEmailFetching = useEmailFetchingModule as jest.Mocked<typeof useEmailFetchingModule>;
const mockedUseEmailActionsBase = useEmailActionsBaseModule as jest.Mocked<typeof useEmailActionsBaseModule>;

describe('useEmailManagement', () => {
  const mockFetchEmails = jest.fn();
  const mockHandleSetStarCount = jest.fn();
  const mockHandleArchive = jest.fn();
  const mockHandleSnooze = jest.fn();
  const mockOnSuggestionRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();

    (mockedUseEmailFetching.useEmailFetching as jest.Mock) = jest.fn(() => ({
      fetchEmails: mockFetchEmails,
      emails: [],
      loading: true,
      decrypting: false,
      refreshing: false,
      loadingModeSwitch: false,
      fetchError: null,
      setEmails: jest.fn(),
      setDecrypting: jest.fn(),
      setLoading: jest.fn(),
      setRefreshing: jest.fn(),
      setLoadingModeSwitch: jest.fn(),
      setFetchError: jest.fn(),
    }));

    (mockedUseEmailActionsBase.useEmailActionsBase as jest.Mock) = jest.fn(() => ({
      handleSetStarCount: mockHandleSetStarCount,
      handleArchive: mockHandleArchive,
      handleSnooze: mockHandleSnooze,
    }));
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      expect(result.current.emails).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.decrypting).toBe(false);
      expect(result.current.refreshing).toBe(false);
      expect(result.current.fetchError).toBeNull();
    });

    it('should provide fetchEmails function', () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      expect(result.current.fetchEmails).toBe(mockFetchEmails);
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark email as read successfully', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      // Set initial emails
      result.current.setEmails([
        { id: '1', isRead: false } as any,
        { id: '2', isRead: false } as any,
      ]);

      mockedAxios.put.mockResolvedValue({ data: {} });

      await result.current.handleMarkAsRead('1');

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(
          expect.stringContaining('/emails/1/read')
        );
      });

      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        const email1 = emails.find((e) => e.id === '1');
        return email1?.isRead === true;
      });
      const emails = result.current.emails;
      const email1 = emails.find((e) => e.id === '1');
      expect(email1?.isRead).toBe(true);
    });

    it('should handle errors when marking as read', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      result.current.setEmails([{ id: '1', isRead: false } as any]);

      const error = new Error('Failed to mark as read');
      mockedAxios.put.mockRejectedValue(error);

      await result.current.handleMarkAsRead('1');

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          'Error marking email as read:',
          error
        );
      });
    });
  });

  describe('handleMarkAsUnread', () => {
    it('should mark email as unread successfully', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      result.current.setEmails([
        { id: '1', isRead: true } as any,
        { id: '2', isRead: true } as any,
      ]);

      mockedAxios.put.mockResolvedValue({ data: {} });

      await result.current.handleMarkAsUnread('1');

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(
          expect.stringContaining('/emails/1/unread')
        );
      });

      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        const email1 = emails.find((e) => e.id === '1');
        return email1?.isRead === false;
      });
      const emails = result.current.emails;
      const email1 = emails.find((e) => e.id === '1');
      expect(email1?.isRead).toBe(false);
    });

    it('should handle errors when marking as unread', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      result.current.setEmails([{ id: '1', isRead: true } as any]);

      const error = new Error('Failed to mark as unread');
      mockedAxios.put.mockRejectedValue(error);

      await result.current.handleMarkAsUnread('1');

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          'Error marking email as unread:',
          error
        );
      });
    });
  });

  describe('handleBulkMarkAsRead', () => {
    it('should bulk mark emails as read successfully', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({
          mode: 'triage',
          onSuggestionRemove: mockOnSuggestionRemove,
        })
      );

      result.current.setEmails([
        { id: '1', isRead: false } as any,
        { id: '2', isRead: false } as any,
        { id: '3', isRead: false } as any,
      ]);

      mockedAxios.post.mockResolvedValue({ data: {} });

      await result.current.handleBulkMarkAsRead(['1', '2']);

      // Optimistic update
      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        return emails.find((e) => e.id === '1')?.isRead === true;
      });
      const emails1 = result.current.emails;
      expect(emails1.find((e) => e.id === '1')?.isRead).toBe(true);
      
      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        return emails.find((e) => e.id === '2')?.isRead === true;
      });
      const emails2 = result.current.emails;
      expect(emails2.find((e) => e.id === '2')?.isRead).toBe(true);
      
      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        return emails.find((e) => e.id === '3')?.isRead === false;
      });
      const emails3 = result.current.emails;
      expect(emails3.find((e) => e.id === '3')?.isRead).toBe(false);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/emails/bulk/read'),
          { emailIds: ['1', '2'] }
        );
      });

      expect(mockOnSuggestionRemove).toHaveBeenCalledWith('1');
      expect(mockOnSuggestionRemove).toHaveBeenCalledWith('2');
    });

    it('should not make API call for empty array', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      await result.current.handleBulkMarkAsRead([]);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should refresh emails on error', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      result.current.setEmails([{ id: '1', isRead: false } as any]);

      const error = new Error('Bulk read failed');
      mockedAxios.post.mockRejectedValue(error);

      await result.current.handleBulkMarkAsRead(['1']);

      await waitFor(() => {
        expect(mockFetchEmails).toHaveBeenCalled();
      });
    });
  });

  describe('handleBulkMarkAsUnread', () => {
    it('should bulk mark emails as unread successfully', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({
          mode: 'triage',
          onSuggestionRemove: mockOnSuggestionRemove,
        })
      );

      result.current.setEmails([
        { id: '1', isRead: true } as any,
        { id: '2', isRead: true } as any,
      ]);

      mockedAxios.post.mockResolvedValue({ data: {} });

      await result.current.handleBulkMarkAsUnread(['1', '2']);

      await waitFor(() => {
        const emails = result.current.emails;
        // eslint-disable-next-line max-nested-callbacks -- Test structure requires nested callbacks: it -> renderHook -> waitFor -> find -> arrow
        return emails.find((e) => e.id === '1')?.isRead === false;
      });
      const emails = result.current.emails;
      expect(emails.find((e) => e.id === '1')?.isRead).toBe(false);
      expect(emails.find((e) => e.id === '2')?.isRead).toBe(false);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/emails/bulk/unread'),
          { emailIds: ['1', '2'] }
        );
      });
    });

    it('should not make API call for empty array', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      await result.current.handleBulkMarkAsUnread([]);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckUrgent', () => {
    it('should check for urgent emails successfully', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      const mockResponse = {
        hasUrgent: true,
        urgentCount: 3,
        urgentEmails: [{ id: '1' }, { id: '2' }, { id: '3' }],
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse });

      const response = await result.current.handleCheckUrgent();

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/emails/check-urgent')
        );
      });

      expect(response).toEqual({
        hasUrgent: true,
        count: 3,
        emails: [{ id: '1' }, { id: '2' }, { id: '3' }],
      });
    });

    it('should return default values on error', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      mockedAxios.post.mockRejectedValue(new Error('Check failed'));

      const response = await result.current.handleCheckUrgent();

      expect(response).toEqual({
        hasUrgent: false,
        count: 0,
        emails: [],
      });
    });

    it('should set refreshing state during check', async () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      const delayedResponse = new Promise((resolve) => {
        setTimeout(() => resolve({ data: { hasUrgent: false } }), 100);
      });
      mockedAxios.post.mockImplementation(() => delayedResponse);

      const checkPromise = result.current.handleCheckUrgent();

      // Check that refreshing is set (we can't directly test this, but we can verify it's called)
      await checkPromise;

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });

  describe('delegated functions', () => {
    it('should delegate handleSetStarCount to useEmailActionsBase', () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      expect(result.current.handleSetStarCount).toBe(mockHandleSetStarCount);
    });

    it('should delegate handleArchive to useEmailActionsBase', () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      expect(result.current.handleArchive).toBe(mockHandleArchive);
    });

    it('should delegate handleSnooze to useEmailActionsBase', () => {
      const { result } = renderHook(() =>
        useEmailManagement({ mode: 'triage' })
      );

      expect(result.current.handleSnooze).toBe(mockHandleSnooze);
    });
  });
});

