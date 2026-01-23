import { useCallback } from 'react';
import { Email, InboxMode } from 'types/email';
import { SetStateAction } from 'react';
import { captureEvent } from 'utils/posthog';
import { useBulkEmailActions } from 'hooks/useBulkEmailActions';
import { useBlockSender } from 'hooks/useBlockSender';
import { useStarCountHandler } from 'hooks/useStarCountHandler';

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
  onShowPriorityOverride: (emailId: string, originalPriorityScore: number, newPriorityScore: number, context?: 'archive' | 'star' | 'manual') => void;
  onShowBlockConfirm: (email: Email) => void;
  onHideBlockConfirm: () => void;
  blockConfirmEmail: Email | null;
  fetchEmails: () => Promise<void>;
  snoozeInput: {
    getSnoozeValue: (emailId: string) => string;
    clearSnooze: (emailId: string) => void;
  };
  emailListRef?: React.RefObject<HTMLDivElement | null>;
  selectedEmailIndex?: number;
  setSelectedEmailIndex?: (index: number) => void;
  splitView?: {
    selectedEmailId: string | null;
    openEmail: (emailId: string) => void;
    closeEmail: () => void;
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
  emailListRef,
  selectedEmailIndex,
  setSelectedEmailIndex,
  splitView,
}: UseEmailActionsProps): UseEmailActionsReturn {
  const { handleSetStarCount } = useStarCountHandler({
    emails,
    handleSetStarCountBase,
    onShowStarDiscrepancy,
    onShowPriorityOverride,
  });

  const handleArchive = useCallback(async (emailId: string, e: React.MouseEvent) => {
    captureEvent('email_archive_clicked', { email_id: emailId });
    
    // Find the index of the email being archived
    const visibleEmails = emails.filter(email => !email.isArchived);
    const archivedIndex = visibleEmails.findIndex(email => email.id === emailId);
    
    setSelectedEmailIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(emailId);
      return newSet;
    });
    
    await handleArchiveBase(emailId, e);
    
    // Scroll to next email after archiving
    if (emailListRef?.current && archivedIndex >= 0 && visibleEmails.length > 1) {
      // After archiving, the email at archivedIndex is removed
      // The email that was at archivedIndex + 1 is now at archivedIndex
      // If we archived the last email, scroll to the previous one (now at archivedIndex - 1)
      const nextIndex = archivedIndex < visibleEmails.length - 1 
        ? archivedIndex  // Next email moved to this index
        : Math.max(0, archivedIndex - 1);  // Previous email (if not first)
      
      setTimeout(() => {
        const emailElement = emailListRef.current?.querySelector(
          `[data-email-index="${nextIndex}"]`
        ) as HTMLElement;
        if (emailElement) {
          emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          // Update selected index to the next email
          if (setSelectedEmailIndex !== undefined) {
            setSelectedEmailIndex(nextIndex);
          }
        }
      }, 100); // Small delay to ensure DOM has updated after optimistic removal
    }
  }, [handleArchiveBase, setSelectedEmailIds, emails, emailListRef, setSelectedEmailIndex]);

  const handleBlockSender = useCallback((emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    captureEvent('email_block_sender_clicked', { email_id: emailId });
    const emailToBlock = emails.find(e => e.id === emailId);
    if (!emailToBlock) return;
    onShowBlockConfirm(emailToBlock);
  }, [emails, onShowBlockConfirm]);

  const bulkActions = useBulkEmailActions({
    selectedEmailIds,
    setSelectedEmailIds,
    handleArchive,
    handleSetStarCount,
    handleBulkMarkAsRead,
    handleBulkMarkAsUnread,
  });

  const { confirmBlockSender } = useBlockSender({
    emails,
    setEmails,
    blockConfirmEmail,
    onHideBlockConfirm,
    fetchEmails,
  });

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

    // Find the index of the email being snoozed for navigation
    const visibleEmails = emails.filter(email => !email.isArchived);
    const snoozedIndex = visibleEmails.findIndex(email => email.id === emailId);

    // Clear snooze input first
    snoozeInput.clearSnooze(emailId);

    // Remove from selection
    setSelectedEmailIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(emailId);
      return newSet;
    });

    // Call the base snooze handler (now optimistic, doesn't wait for API)
    handleSnoozeBase(emailId, duration);

    // Navigate to next email in split view after snoozing
    if (splitView?.selectedEmailId === emailId) {
      // Filter out the just-snoozed email to get the remaining visible emails
      const remainingEmails = visibleEmails.filter(e => e.id !== emailId);
      
      if (remainingEmails.length === 0) {
        splitView.closeEmail();
        return;
      }
      
      // Use the current index as the next index (since we removed the current email)
      const nextIndex = snoozedIndex < remainingEmails.length 
        ? snoozedIndex 
        : Math.max(0, remainingEmails.length - 1);
      
      const nextEmail = remainingEmails[nextIndex];
      if (nextEmail) {
        splitView.openEmail(nextEmail.id);
        if (setSelectedEmailIndex !== undefined) {
          setSelectedEmailIndex(nextIndex);
        }
      } else {
        splitView.closeEmail();
      }
    } else if (emailListRef?.current && snoozedIndex >= 0 && visibleEmails.length > 1) {
      // Scroll to next email in list view after snoozing
      const nextIndex = snoozedIndex < visibleEmails.length - 1 
        ? snoozedIndex 
        : Math.max(0, snoozedIndex - 1);
      
      setTimeout(() => {
        const emailElement = emailListRef.current?.querySelector(
          `[data-email-index="${nextIndex}"]`
        ) as HTMLElement;
        if (emailElement) {
          emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          if (setSelectedEmailIndex !== undefined) {
            setSelectedEmailIndex(nextIndex);
          }
        }
      }, 100);
    }
  }, [snoozeInput, handleSnoozeBase, emails, splitView, emailListRef, setSelectedEmailIndex, setSelectedEmailIds]);

  return {
    handleSetStarCount,
    handleArchive,
    handleBlockSender,
    confirmBlockSender,
    handleSnooze,
    ...bulkActions,
  };
}

