import { useCallback } from 'react';
import axios from 'axios';
import { Email, InboxMode } from '../types/email';
import { SetStateAction } from 'react';
import { API_URL } from '../config/api';
import { captureEvent } from '../utils/posthog';

interface UseEmailActionsProps {
  mode: InboxMode;
  emails: Email[];
  setEmails: React.Dispatch<SetStateAction<Email[]>>;
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSetStarCountBase: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<{ discrepancy: number; predictedStarCount: number } | null>;
  handleArchiveBase: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleSnoozeBase: (emailId: string, duration: string) => Promise<void>;
  handleMarkAsRead: (emailId: string) => Promise<void>;
  handleBulkMarkAsRead?: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread?: (emailIds: string[]) => Promise<void>;
  onShowStarDiscrepancy: (emailId: string, userStarCount: number, predictedStarCount: number) => void;
  onShowPriorityOverride: (emailId: string, originalPriorityScore: number, newPriorityScore: number) => void;
  onShowBlockConfirm: (email: Email) => void;
  onHideBlockConfirm: () => void;
  blockConfirmEmail: Email | null;
  fetchEmails: () => Promise<void>;
  snoozeInput: {
    getSnoozeValue: (emailId: string) => string;
    clearSnooze: (emailId: string) => void;
  };
}

interface UseEmailActionsReturn {
  handleSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  handleArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleBlockSender: (emailId: string, e: React.MouseEvent) => void;
  confirmBlockSender: () => Promise<void>;
  handleSnooze: (emailId: string) => Promise<void>;
  handleBulkArchive: () => Promise<void>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

export function useEmailActions({
  emails,
  setEmails,
  selectedEmailIds,
  setSelectedEmailIds,
  handleSetStarCountBase,
  handleArchiveBase,
  handleSnoozeBase,
  handleMarkAsRead,
  handleBulkMarkAsRead,
  handleBulkMarkAsUnread,
  onShowStarDiscrepancy,
  onShowPriorityOverride,
  onShowBlockConfirm,
  onHideBlockConfirm,
  blockConfirmEmail,
  fetchEmails,
  snoozeInput,
}: UseEmailActionsProps): UseEmailActionsReturn {
  const handleSetStarCount = useCallback(async (emailId: string, starCount: number, e?: React.MouseEvent) => {
    const email = emails.find(e => e.id === emailId);
    const previousStarCount = email?.starCount || 0;
    const originalPriorityScore = email?.priorityScore || 50;
    
    captureEvent('email_star_set', {
      email_id: emailId,
      star_count: starCount,
      previous_star_count: previousStarCount,
    });
    
    const result = await handleSetStarCountBase(emailId, starCount, e);
    
    // Convert star count to priority score (0 stars = 0-25, 1 star = 26-50, 2 stars = 51-75, 3 stars = 76-100)
    const newPriorityScore = starCount === 0 ? 12.5 : 
                            starCount === 1 ? 37.5 :
                            starCount === 2 ? 62.5 : 87.5;
    
    if (result && result.discrepancy >= 2 && starCount > 0) {
      // Show priority override modal for significant discrepancies
      const priorityDifference = Math.abs(newPriorityScore - originalPriorityScore);
      if (priorityDifference >= 20) {
        onShowPriorityOverride(emailId, originalPriorityScore, newPriorityScore);
      } else {
        // Fall back to star discrepancy modal for smaller differences
        onShowStarDiscrepancy(emailId, starCount, result.predictedStarCount);
      }
    }
  }, [emails, handleSetStarCountBase, onShowStarDiscrepancy, onShowPriorityOverride]);

  const handleArchive = useCallback(async (emailId: string, e: React.MouseEvent) => {
    captureEvent('email_archive_clicked', { email_id: emailId });
    setSelectedEmailIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(emailId);
      return newSet;
    });
    await handleArchiveBase(emailId, e);
  }, [handleArchiveBase, setSelectedEmailIds]);

  const handleBlockSender = useCallback((emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    captureEvent('email_block_sender_clicked', { email_id: emailId });
    const emailToBlock = emails.find(e => e.id === emailId);
    if (!emailToBlock) return;
    onShowBlockConfirm(emailToBlock);
  }, [emails, onShowBlockConfirm]);

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

  const confirmBlockSender = useCallback(async () => {
    if (!blockConfirmEmail) return;
    
    const emailToBlock = blockConfirmEmail;
    captureEvent('sender_blocked', { email_id: emailToBlock.id });
    onHideBlockConfirm();
    
    // Optimistic update - remove from UI
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailToBlock.id));
    
    try {
      await axios.post(`${API_URL}/emails/${emailToBlock.id}/block-sender`);
      fetchEmails().catch(err => console.error('Error refreshing after block:', err));
    } catch (error) {
      console.error('Error blocking sender:', error);
      // Revert on error
      setEmails(prevEmails => [...prevEmails, emailToBlock].sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      ));
    }
  }, [blockConfirmEmail, onHideBlockConfirm, setEmails, fetchEmails]);

  const handleSnooze = useCallback(async (emailId: string) => {
    const duration = snoozeInput.getSnoozeValue(emailId)?.trim();
    if (!duration) {
      console.warn('Cannot snooze: duration is empty');
      return;
    }

    captureEvent('email_snooze_confirmed', {
      email_id: emailId,
      // Only track length, not the actual content
      snooze_input_length: duration.length,
    });

    try {
      await handleSnoozeBase(emailId, duration);
      snoozeInput.clearSnooze(emailId);
    } catch (error: any) {
      console.error('Error snoozing email:', error);
      alert(error.response?.data?.message || 'Failed to snooze email. Please try again.');
    }
  }, [snoozeInput, handleSnoozeBase]);

  return {
    handleSetStarCount,
    handleArchive,
    handleBlockSender,
    confirmBlockSender,
    handleSnooze,
    handleBulkArchive,
    handleBulkStar,
    handleBulkMarkAsRead: handleBulkMarkAsReadAction,
    handleBulkMarkAsUnread: handleBulkMarkAsUnreadAction,
  };
}

