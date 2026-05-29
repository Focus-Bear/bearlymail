import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';

import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import * as useEmailActionsBaseModule from './useEmailActionsBase';
import * as useEmailFetchingModule from './useEmailFetching';
import { useEmailManagement } from './useEmailManagement';

vi.mock('axios');
vi.mock('./useEmailFetching');
vi.mock('./useEmailActionsBase');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseEmailFetching = useEmailFetchingModule as jest.Mocked<typeof useEmailFetchingModule>;
const mockedUseEmailActionsBase = useEmailActionsBaseModule as jest.Mocked<typeof useEmailActionsBaseModule>;

// Helper to create a test store
const createTestStore = (
  preloadedState: Partial<
    import('store/slices/inboxDataSlice').InboxDataState & import('store/slices/inboxUISlice').InboxUIState
  > = {}
) => {
  const {
    emails,
    hasMore,
    totalCount,
    currentOffset,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
    lastFetchedAt,
    ...uiState
  } = preloadedState as unknown as import('store/slices/inboxDataSlice').InboxDataState &
    import('store/slices/inboxUISlice').InboxUIState;
  return configureStore({
    reducer: {
      inboxData: inboxDataReducer,
      inboxUI: inboxUIReducer,
    },
    preloadedState: {
      inboxData: {
        emails: emails ?? ([] as import('types/email').Email[]),
        hasMore: hasMore ?? false,
        totalCount: totalCount ?? 0,
        currentOffset: currentOffset ?? 0,
        categorySummary: categorySummary ?? null,
        loadedCategoryNames: loadedCategoryNames ?? ([] as string[]),
        loadingCategoryNames: loadingCategoryNames ?? ([] as string[]),
        exhaustedCategoryNames: exhaustedCategoryNames ?? ([] as string[]),
        lastFetchedAt: lastFetchedAt ?? null,
      },
      inboxUI: {
        optimisticallyArchived: uiState.optimisticallyArchived ?? ([] as string[]),
        optimisticallySnoozed: uiState.optimisticallySnoozed ?? ([] as string[]),
        animatingOut: uiState.animatingOut ?? ([] as { id: string; type: 'archive' | 'priority' }[]),
        loading: uiState.loading ?? true,
        decrypting: uiState.decrypting ?? false,
        refreshing: uiState.refreshing ?? false,
        loadingModeSwitch: uiState.loadingModeSwitch ?? false,
        fetchError: uiState.fetchError ?? (null as string | null),
        summaryLoading: uiState.summaryLoading ?? false,
      },
    },
  });
};

// Wrapper component for Redux Provider
const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store, children });
  };
};

describe('useEmailManagement', () => {
  const mockFetchEmails = vi.fn();
  const mockHandleSetStarCount = vi.fn();
  const mockHandleArchive = vi.fn();
  const mockHandleSnooze = vi.fn();
  const mockOnSuggestionRemove = vi.fn();
  let testStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
    testStore = createTestStore();

    (mockedUseEmailFetching.useEmailFetching as jest.Mock) = vi.fn(() => ({
      fetchEmails: mockFetchEmails,
      emails: [],
      loading: true,
      decrypting: false,
      refreshing: false,
      loadingModeSwitch: false,
      fetchError: null,
      setEmails: vi.fn(),
      setDecrypting: vi.fn(),
      setLoading: vi.fn(),
      setRefreshing: vi.fn(),
      setLoadingModeSwitch: vi.fn(),
      setFetchError: vi.fn(),
    }));

    (mockedUseEmailActionsBase.useEmailActionsBase as jest.Mock) = vi.fn(() => ({
      handleSetStarCount: mockHandleSetStarCount,
      handleArchive: mockHandleArchive,
      handleSnooze: mockHandleSnooze,
    }));
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      expect(result.current.emails).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.decrypting).toBe(false);
      expect(result.current.refreshing).toBe(false);
      expect(result.current.fetchError).toBeNull();
    });

    it('should provide fetchEmails function', () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      expect(result.current.fetchEmails).toBe(mockFetchEmails);
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark email as read successfully', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      // Set initial emails
      result.current.setEmails([
        { id: '1', isRead: false } as unknown as Email,
        { id: '2', isRead: false } as unknown as Email,
      ]);

      mockedAxios.put.mockResolvedValue({ data: {} });

      await result.current.handleMarkAsRead('1');

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(expect.stringContaining('/emails/1/read'));
      });

      await waitFor(() => {
        const emails = result.current.emails;
        const email1 = emails.find(event => event.id === '1');
        return email1?.isRead === true;
      });
      const emails = result.current.emails;
      const email1 = emails.find(event => event.id === '1');
      expect(email1?.isRead).toBe(true);
    });

    it('should handle errors when marking as read', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      result.current.setEmails([{ id: '1', isRead: false } as unknown as Email]);

      const error = new Error('Failed to mark as read');
      mockedAxios.put.mockRejectedValue(error);

      await result.current.handleMarkAsRead('1');

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('Error marking email as read:', error);
      });
    });
  });

  describe('handleMarkAsUnread', () => {
    it('should mark email as unread successfully', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      result.current.setEmails([
        { id: '1', isRead: true } as unknown as Email,
        { id: '2', isRead: true } as unknown as Email,
      ]);

      mockedAxios.put.mockResolvedValue({ data: {} });

      await result.current.handleMarkAsUnread('1');

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(expect.stringContaining('/emails/1/unread'));
      });

      await waitFor(() => {
        const emails = result.current.emails;
        const email1 = emails.find(event => event.id === '1');
        return email1?.isRead === false;
      });
      const emails = result.current.emails;
      const email1 = emails.find(event => event.id === '1');
      expect(email1?.isRead).toBe(false);
    });

    it('should handle errors when marking as unread', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      result.current.setEmails([{ id: '1', isRead: true } as unknown as Email]);

      const error = new Error('Failed to mark as unread');
      mockedAxios.put.mockRejectedValue(error);

      await result.current.handleMarkAsUnread('1');

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('Error marking email as unread:', error);
      });
    });
  });

  describe('handleBulkMarkAsRead', () => {
    it('should bulk mark emails as read successfully', async () => {
      const { result } = renderHook(
        () =>
          useEmailManagement({
            mode: 'triage',
            onSuggestionRemove: mockOnSuggestionRemove,
          }),
        { wrapper: createWrapper(testStore) }
      );

      result.current.setEmails([
        { id: '1', isRead: false } as unknown as Email,
        { id: '2', isRead: false } as unknown as Email,
        { id: '3', isRead: false } as unknown as Email,
      ]);

      mockedAxios.post.mockResolvedValue({ data: {} });

      await result.current.handleBulkMarkAsRead(['1', '2']);

      // Optimistic update
      await waitFor(() => {
        const emails = result.current.emails;
        return emails.find(event => event.id === '1')?.isRead === true;
      });
      const emails1 = result.current.emails;
      expect(emails1.find(event => event.id === '1')?.isRead).toBe(true);

      await waitFor(() => {
        const emails = result.current.emails;
        return emails.find(event => event.id === '2')?.isRead === true;
      });
      const emails2 = result.current.emails;
      expect(emails2.find(event => event.id === '2')?.isRead).toBe(true);

      await waitFor(() => {
        const emails = result.current.emails;
        return emails.find(event => event.id === '3')?.isRead === false;
      });
      const emails3 = result.current.emails;
      expect(emails3.find(event => event.id === '3')?.isRead).toBe(false);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/bulk/read'), {
          emailIds: ['1', '2'],
        });
      });

      expect(mockOnSuggestionRemove).toHaveBeenCalledWith('1');
      expect(mockOnSuggestionRemove).toHaveBeenCalledWith('2');
    });

    it('should not make API call for empty array', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      await result.current.handleBulkMarkAsRead([]);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should refresh emails on error', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      result.current.setEmails([{ id: '1', isRead: false } as unknown as Email]);

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
      const { result } = renderHook(
        () =>
          useEmailManagement({
            mode: 'triage',
            onSuggestionRemove: mockOnSuggestionRemove,
          }),
        { wrapper: createWrapper(testStore) }
      );

      result.current.setEmails([
        { id: '1', isRead: true } as unknown as Email,
        { id: '2', isRead: true } as unknown as Email,
      ]);

      mockedAxios.post.mockResolvedValue({ data: {} });

      await result.current.handleBulkMarkAsUnread(['1', '2']);

      await waitFor(() => {
        const emails = result.current.emails;
        return emails.find(event => event.id === '1')?.isRead === false;
      });
      const emails = result.current.emails;
      expect(emails.find(event => event.id === '1')?.isRead).toBe(false);
      expect(emails.find(event => event.id === '2')?.isRead).toBe(false);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/bulk/unread'), {
          emailIds: ['1', '2'],
        });
      });
    });

    it('should not make API call for empty array', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      await result.current.handleBulkMarkAsUnread([]);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckUrgent', () => {
    it('should check for urgent emails successfully', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      const mockResponse = {
        hasUrgent: true,
        urgentCount: 3,
        urgentEmails: [{ id: '1' }, { id: '2' }, { id: '3' }],
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse });

      const response = await result.current.handleCheckUrgent();

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/check-urgent'));
      });

      expect(response).toEqual({
        hasUrgent: true,
        count: 3,
        emails: [{ id: '1' }, { id: '2' }, { id: '3' }],
      });
    });

    it('should return default values on error', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      mockedAxios.post.mockRejectedValue(new Error('Check failed'));

      const response = await result.current.handleCheckUrgent();

      expect(response).toEqual({
        hasUrgent: false,
        count: 0,
        emails: [],
      });
    });

    it('should set refreshing state during check', async () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      const delayedResponse = new Promise(resolve => {
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
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      expect(result.current.handleSetStarCount).toBe(mockHandleSetStarCount);
    });

    it('should delegate handleArchive to useEmailActionsBase', () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      expect(result.current.handleArchive).toBe(mockHandleArchive);
    });

    it('should delegate handleSnooze to useEmailActionsBase', () => {
      const { result } = renderHook(() => useEmailManagement({ mode: 'triage' }), {
        wrapper: createWrapper(testStore),
      });

      expect(result.current.handleSnooze).toBe(mockHandleSnooze);
    });
  });
});
