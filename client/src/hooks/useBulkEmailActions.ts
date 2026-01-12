import { useCallback } from 'react';
import { captureEvent } from 'utils/posthog';

interface UseBulkEmailActionsProps {
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  handleBulkMarkAsRead?: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread?: (emailIds: string[]) => Promise<void>;
}

interface UseBulkEmailActionsReturn {
  handleBulkArchive: () => Promise<void>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

export function useBulkEmailActions({
  selectedEmailIds,
  setSelectedEmailIds,
  handleArchive,
  handleSetStarCount,
  handleBulkMarkAsRead,
  handleBulkMarkAsUnread,
}: UseBulkEmailActionsProps): UseBulkEmailActionsReturn {
  const handleBulkArchive = useCallback(async () => {
    if (selectedEmailIds.size === 0) return;
    captureEvent('bulk_archive_clicked', { selected_count: selectedEmailIds.size });
    await Promise.all(Array.from(selectedEmailIds).map(id => 
      handleArchive(id, { stopPropagation: () => {} } as React.MouseEvent)
    ));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleArchive, setSelectedEmailIds]);

  const handleBulkStar = useCallback(async (starCount: number) => {
    if (selectedEmailIds.size === 0) return;
    captureEvent('bulk_star_set', {
      star_count: starCount,
      selected_count: selectedEmailIds.size,
    });
    await Promise.all(Array.from(selectedEmailIds).map(id => handleSetStarCount(id, starCount)));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleSetStarCount, setSelectedEmailIds]);

  const handleBulkMarkAsReadAction = useCallback(async () => {
    if (selectedEmailIds.size === 0 || !handleBulkMarkAsRead) return;
    captureEvent('bulk_mark_as_read_clicked', { selected_count: selectedEmailIds.size });
    await handleBulkMarkAsRead(Array.from(selectedEmailIds));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleBulkMarkAsRead, setSelectedEmailIds]);

  const handleBulkMarkAsUnreadAction = useCallback(async () => {
    if (selectedEmailIds.size === 0 || !handleBulkMarkAsUnread) return;
    captureEvent('bulk_mark_as_unread_clicked', { selected_count: selectedEmailIds.size });
    await handleBulkMarkAsUnread(Array.from(selectedEmailIds));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleBulkMarkAsUnread, setSelectedEmailIds]);

  return {
    handleBulkArchive,
    handleBulkStar,
    handleBulkMarkAsRead: handleBulkMarkAsReadAction,
    handleBulkMarkAsUnread: handleBulkMarkAsUnreadAction,
  };
}



