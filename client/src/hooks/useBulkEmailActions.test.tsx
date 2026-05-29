import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useBulkEmailActions } from './useBulkEmailActions';

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

const createTestStore = (emails: Email[] = []) => {
  return configureStore({
    reducer: {
      inboxData: inboxDataReducer,
      inboxUI: inboxUIReducer,
    },
    preloadedState: {
      inboxData: {
        emails,
        hasMore: false,
        totalCount: 0,
        currentOffset: 0,
        categorySummary: null,
        loadedCategoryNames: [] as string[],
        loadingCategoryNames: [] as string[],
        exhaustedCategoryNames: [] as string[],
        lastFetchedAt: null as number | null,
      },
      inboxUI: {
        optimisticallyArchived: [] as string[],
        optimisticallySnoozed: [] as string[],
        animatingOut: [] as { id: string; type: 'archive' | 'priority' }[],
        loading: false,
        decrypting: false,
        refreshing: false,
        loadingModeSwitch: false,
        fetchError: null as string | null,
        summaryLoading: false,
      },
    },
  });
};

const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  return ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe('useBulkEmailActions', () => {
  const mockHandleArchive = vi.fn();
  const mockHandleSetStarCount = vi.fn();
  const mockHandleBulkMarkAsRead = vi.fn();
  const mockHandleBulkMarkAsUnread = vi.fn();
  const mockSetSelectedEmailIds = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleArchive.mockResolvedValue(undefined);
    mockHandleSetStarCount.mockResolvedValue(undefined);
    mockHandleBulkMarkAsRead.mockResolvedValue(undefined);
    mockHandleBulkMarkAsUnread.mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({ data: { message: 'Emails archived' } });
  });

  describe('handleBulkArchive', () => {
    it('should do nothing when no emails selected', async () => {
      const store = createTestStore();
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: new Set(),
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkArchive();
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockedCaptureEvent).not.toHaveBeenCalled();
    });

    it('should archive all selected emails with single bulk API call', async () => {
      const testEmails: Email[] = [
        { id: '1', subject: 'Test 1' } as Email,
        { id: '2', subject: 'Test 2' } as Email,
        { id: '3', subject: 'Test 3' } as Email,
      ];
      const store = createTestStore(testEmails);
      const selectedIds = new Set(['1', '2', '3']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkArchive();
      });

      // Should make a single bulk API call instead of 3 individual calls
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/bulk/archive'), {
        emailIds: ['1', '2', '3'],
      });
      expect(mockedCaptureEvent).toHaveBeenCalledWith('bulk_archive_clicked', {
        selected_count: 3,
      });
      expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
    });

    it('should clear selection after archiving', async () => {
      const testEmails: Email[] = [{ id: '1', subject: 'Test 1' } as Email, { id: '2', subject: 'Test 2' } as Email];
      const store = createTestStore(testEmails);
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkArchive();
      });

      await waitFor(() => {
        expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
      });
    });
  });

  describe('handleBulkStar', () => {
    it('should do nothing when no emails selected', async () => {
      const store = createTestStore();
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: new Set(),
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkStar(2);
      });

      expect(mockHandleSetStarCount).not.toHaveBeenCalled();
    });

    it('should set star count for all selected emails', async () => {
      const store = createTestStore();
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkStar(3);
      });

      expect(mockHandleSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockHandleSetStarCount).toHaveBeenCalledWith('1', 3);
      expect(mockHandleSetStarCount).toHaveBeenCalledWith('2', 3);
      expect(mockedCaptureEvent).toHaveBeenCalledWith('bulk_star_set', {
        star_count: 3,
        selected_count: 2,
      });
      expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
    });

    it('should handle star count 0', async () => {
      const store = createTestStore();
      const selectedIds = new Set(['1']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkStar(0);
      });

      expect(mockHandleSetStarCount).toHaveBeenCalledWith('1', 0);
    });
  });

  describe('handleBulkMarkAsRead', () => {
    it('should do nothing when no emails selected', async () => {
      const store = createTestStore();
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: new Set(),
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
            handleBulkMarkAsRead: mockHandleBulkMarkAsRead,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkMarkAsRead();
      });

      expect(mockHandleBulkMarkAsRead).not.toHaveBeenCalled();
    });

    it('should do nothing when handler not provided', async () => {
      const store = createTestStore();
      const selectedIds = new Set(['1']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkMarkAsRead();
      });

      expect(mockHandleBulkMarkAsRead).not.toHaveBeenCalled();
    });

    it('should mark all selected emails as read', async () => {
      const store = createTestStore();
      const selectedIds = new Set(['1', '2', '3']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
            handleBulkMarkAsRead: mockHandleBulkMarkAsRead,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkMarkAsRead();
      });

      expect(mockHandleBulkMarkAsRead).toHaveBeenCalledWith(['1', '2', '3']);
      expect(mockedCaptureEvent).toHaveBeenCalledWith('bulk_mark_as_read_clicked', {
        selected_count: 3,
      });
      expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
    });
  });

  describe('handleBulkMarkAsUnread', () => {
    it('should do nothing when no emails selected', async () => {
      const store = createTestStore();
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: new Set(),
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
            handleBulkMarkAsUnread: mockHandleBulkMarkAsUnread,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkMarkAsUnread();
      });

      expect(mockHandleBulkMarkAsUnread).not.toHaveBeenCalled();
    });

    it('should mark all selected emails as unread', async () => {
      const store = createTestStore();
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(
        () =>
          useBulkEmailActions({
            selectedEmailIds: selectedIds,
            setSelectedEmailIds: mockSetSelectedEmailIds,
            handleArchive: mockHandleArchive,
            handleSetStarCount: mockHandleSetStarCount,
            handleBulkMarkAsUnread: mockHandleBulkMarkAsUnread,
          }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleBulkMarkAsUnread();
      });

      expect(mockHandleBulkMarkAsUnread).toHaveBeenCalledWith(['1', '2']);
      expect(mockedCaptureEvent).toHaveBeenCalledWith('bulk_mark_as_unread_clicked', {
        selected_count: 2,
      });
      expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
    });
  });
});
