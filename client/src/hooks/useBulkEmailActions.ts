import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { removeEmail, restoreEmail, addOptimisticArchive, removeOptimisticArchive } from 'store/slices/emailSlice';
import { selectEmails } from 'store/selectors/emailSelectors';
import { Email } from 'types/email';

interface UseBulkEmailActionsProps {
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  handleBulkMarkAsRead?: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread?: (emailIds: string[]) => Promise<void>;
  onTabCountsUpdateOptimistically?: (changes: { triage?: number; action?: number; followUp?: number }) => void;
  mode?: string;
}

interface UseBulkEmailActionsReturn {
  handleBulkArchive: () => Promise<void>;
  handleBulkArchiveByIds: (emailIds: string[]) => Promise<void>;
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
  onTabCountsUpdateOptimistically,
  mode,
}: UseBulkEmailActionsProps): UseBulkEmailActionsReturn {
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);

  // Core archive implementation - archives a specific list of email IDs with optimistic updates
  const handleBulkArchiveByIds = useCallback(async (emailIdsToArchive: string[]) => {
    if (emailIdsToArchive.length === 0) return;

    captureEvent('bulk_archive_clicked', { selected_count: emailIdsToArchive.length });

    // Store emails for potential rollback
    const emailsToArchive: Email[] = [];
    emailIdsToArchive.forEach(id => {
      const email = emails.find(e => e.id === id);
      if (email) {
        emailsToArchive.push(email);
      }
    });

    // Optimistic update - remove all emails from list and add to optimistic archive
    emailIdsToArchive.forEach(id => {
      dispatch(removeEmail(id));
      dispatch(addOptimisticArchive(id));
    });

    // Optimistically update tab counts
    if (onTabCountsUpdateOptimistically) {
      if (mode === 'triage') {
        onTabCountsUpdateOptimistically({ triage: -emailIdsToArchive.length });
      } else if (mode === 'action') {
        onTabCountsUpdateOptimistically({ action: -emailIdsToArchive.length });
      } else if (mode === 'follow-up') {
        onTabCountsUpdateOptimistically({ followUp: -emailIdsToArchive.length });
      }
    }

    // Make single bulk API call
    try {
      await axios.post(`${API_URL}/emails/bulk/archive`, { emailIds: emailIdsToArchive });
      console.log(`[BulkArchive] Successfully archived ${emailIdsToArchive.length} emails`);
    } catch (error) {
      console.error('[BulkArchive] Failed to archive emails:', error);
      // Revert optimistic updates on error
      emailsToArchive.forEach(email => {
        dispatch(restoreEmail(email));
        dispatch(removeOptimisticArchive(email.id));
      });
      // Revert tab count changes
      if (onTabCountsUpdateOptimistically) {
        if (mode === 'triage') {
          onTabCountsUpdateOptimistically({ triage: emailIdsToArchive.length });
        } else if (mode === 'action') {
          onTabCountsUpdateOptimistically({ action: emailIdsToArchive.length });
        } else if (mode === 'follow-up') {
          onTabCountsUpdateOptimistically({ followUp: emailIdsToArchive.length });
        }
      }
    }
  }, [dispatch, emails, onTabCountsUpdateOptimistically, mode]);

  // Use bulk archive API endpoint for efficiency (single API call instead of N calls)
  const handleBulkArchive = useCallback(async () => {
    if (selectedEmailIds.size === 0) return;

    const emailIds = Array.from(selectedEmailIds);

    // Clear selection before archiving
    setSelectedEmailIds(new Set());

    await handleBulkArchiveByIds(emailIds);
  }, [selectedEmailIds, setSelectedEmailIds, handleBulkArchiveByIds]);

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
    handleBulkArchiveByIds,
    handleBulkStar,
    handleBulkMarkAsRead: handleBulkMarkAsReadAction,
    handleBulkMarkAsUnread: handleBulkMarkAsUnreadAction,
  };
}



