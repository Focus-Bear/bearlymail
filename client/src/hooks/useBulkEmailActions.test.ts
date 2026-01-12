import { renderHook, act, waitFor } from '@testing-library/react';
import { useBulkEmailActions } from './useBulkEmailActions';
import { captureEvent } from 'utils/posthog';

jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

describe('useBulkEmailActions', () => {
  const mockHandleArchive = jest.fn();
  const mockHandleSetStarCount = jest.fn();
  const mockHandleBulkMarkAsRead = jest.fn();
  const mockHandleBulkMarkAsUnread = jest.fn();
  const mockSetSelectedEmailIds = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleArchive.mockResolvedValue(undefined);
    mockHandleSetStarCount.mockResolvedValue(undefined);
    mockHandleBulkMarkAsRead.mockResolvedValue(undefined);
    mockHandleBulkMarkAsUnread.mockResolvedValue(undefined);
  });

  describe('handleBulkArchive', () => {
    it('should do nothing when no emails selected', async () => {
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: new Set(),
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
      );

      await act(async () => {
        await result.current.handleBulkArchive();
      });

      expect(mockHandleArchive).not.toHaveBeenCalled();
      expect(mockedCaptureEvent).not.toHaveBeenCalled();
    });

    it('should archive all selected emails', async () => {
      const selectedIds = new Set(['1', '2', '3']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
      );

      await act(async () => {
        await result.current.handleBulkArchive();
      });

      expect(mockHandleArchive).toHaveBeenCalledTimes(3);
      expect(mockHandleArchive).toHaveBeenCalledWith('1', expect.any(Object));
      expect(mockHandleArchive).toHaveBeenCalledWith('2', expect.any(Object));
      expect(mockHandleArchive).toHaveBeenCalledWith('3', expect.any(Object));
      expect(mockedCaptureEvent).toHaveBeenCalledWith('bulk_archive_clicked', {
        selected_count: 3,
      });
      expect(mockSetSelectedEmailIds).toHaveBeenCalledWith(new Set());
    });

    it('should clear selection after archiving', async () => {
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
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
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: new Set(),
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
      );

      await act(async () => {
        await result.current.handleBulkStar(2);
      });

      expect(mockHandleSetStarCount).not.toHaveBeenCalled();
    });

    it('should set star count for all selected emails', async () => {
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
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
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
      );

      await act(async () => {
        await result.current.handleBulkStar(0);
      });

      expect(mockHandleSetStarCount).toHaveBeenCalledWith('1', 0);
    });
  });

  describe('handleBulkMarkAsRead', () => {
    it('should do nothing when no emails selected', async () => {
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: new Set(),
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
          handleBulkMarkAsRead: mockHandleBulkMarkAsRead,
        })
      );

      await act(async () => {
        await result.current.handleBulkMarkAsRead();
      });

      expect(mockHandleBulkMarkAsRead).not.toHaveBeenCalled();
    });

    it('should do nothing when handler not provided', async () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
        })
      );

      await act(async () => {
        await result.current.handleBulkMarkAsRead();
      });

      expect(mockHandleBulkMarkAsRead).not.toHaveBeenCalled();
    });

    it('should mark all selected emails as read', async () => {
      const selectedIds = new Set(['1', '2', '3']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
          handleBulkMarkAsRead: mockHandleBulkMarkAsRead,
        })
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
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: new Set(),
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
          handleBulkMarkAsUnread: mockHandleBulkMarkAsUnread,
        })
      );

      await act(async () => {
        await result.current.handleBulkMarkAsUnread();
      });

      expect(mockHandleBulkMarkAsUnread).not.toHaveBeenCalled();
    });

    it('should mark all selected emails as unread', async () => {
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(() =>
        useBulkEmailActions({
          selectedEmailIds: selectedIds,
          setSelectedEmailIds: mockSetSelectedEmailIds,
          handleArchive: mockHandleArchive,
          handleSetStarCount: mockHandleSetStarCount,
          handleBulkMarkAsUnread: mockHandleBulkMarkAsUnread,
        })
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



