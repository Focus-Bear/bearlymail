import { useCallback } from 'react';
import { SetStateAction } from 'react';
import { Email, InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { useBlockSender } from 'hooks/useBlockSender';
import { useBulkEmailActions } from 'hooks/useBulkEmailActions';
import { useStarCountHandler } from 'hooks/useStarCountHandler';

type SplitViewRef = { selectedEmailId: string | null; openEmail: (emailId: string) => void; closeEmail: () => void };

function navigateSplitViewAfterRemove(
  removedEmailId: string,
  removedIndex: number,
  visibleEmails: Email[],
  splitView: SplitViewRef,
  setSelectedEmailIndex?: (i: number) => void
): void {
  const remaining = visibleEmails.filter(email => email.id !== removedEmailId);
  if (remaining.length === 0) {
    splitView.closeEmail();
    return;
  }
  const nextIndex = removedIndex < remaining.length ? removedIndex : Math.max(0, remaining.length - 1);
  const nextEmail = remaining[nextIndex];
  if (nextEmail) {
    splitView.openEmail(nextEmail.id);
    setSelectedEmailIndex?.(nextIndex);
  } else {
    splitView.closeEmail();
  }
}

function scrollToEmailAtIndex(
  emailListRef: React.RefObject<HTMLDivElement | null>,
  nextIndex: number,
  setSelectedEmailIndex?: (index: number) => void
): void {
  setTimeout(() => {
    const el = emailListRef.current?.querySelector(`[data-email-index="${nextIndex}"]`) as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setSelectedEmailIndex?.(nextIndex);
    }
  }, 100);
}

function removeFromSelection(
  emailId: string,
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>
): void {
  setSelectedEmailIds(prev => {
    const ns = new Set(prev);
    ns.delete(emailId);
    return ns;
  });
}

interface UseEmailActionsProps {
  mode: InboxMode;
  emails: Email[];
  setEmails: React.Dispatch<SetStateAction<Email[]>>;
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSetStarCountBase: (
    emailId: string,
    starCount: number,
    event?: React.MouseEvent
  ) => Promise<{ discrepancy: number; predictedStarCount: number } | null>;
  handleArchiveBase: (emailId: string, event: React.MouseEvent) => Promise<void>;
  handleSnoozeBase: (emailId: string, duration: string) => Promise<void>;
  handleMarkAsRead: (emailId: string) => Promise<void>;
  handleBulkMarkAsRead?: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread?: (emailIds: string[]) => Promise<void>;
  onShowStarDiscrepancy: (emailId: string, userStarCount: number, predictedStarCount: number) => void;
  onShowPriorityOverride: (
    emailId: string,
    originalPriorityScore: number,
    newPriorityScore: number,
    context?: 'archive' | 'star' | 'manual'
  ) => void;
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
  onTabCountsUpdateOptimistically?: (changes: { triage?: number; action?: number; followUp?: number }) => void;
}

interface UseEmailActionsReturn {
  handleSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  handleArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  handleBlockSender: (emailId: string, event: React.MouseEvent) => void;
  confirmBlockSender: () => Promise<void>;
  handleSnooze: (emailId: string) => Promise<void>;
  handleBulkArchive: () => Promise<void>;
  handleBulkArchiveByIds: (emailIds: string[]) => Promise<void>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

export function useEmailActions(props: UseEmailActionsProps): UseEmailActionsReturn {
  const {
    mode, emails, setEmails, selectedEmailIds, setSelectedEmailIds,
    handleSetStarCountBase, handleArchiveBase, handleSnoozeBase,
    handleMarkAsRead, handleBulkMarkAsRead, handleBulkMarkAsUnread,
    onShowStarDiscrepancy, onShowPriorityOverride,
    onShowBlockConfirm, onHideBlockConfirm, blockConfirmEmail, fetchEmails,
    snoozeInput, emailListRef, selectedEmailIndex, setSelectedEmailIndex,
    splitView, onTabCountsUpdateOptimistically,
  } = props;
  const { handleSetStarCount } = useStarCountHandler({
    emails,
    handleSetStarCountBase,
    onShowStarDiscrepancy,
    onShowPriorityOverride,
  });

  const handleArchive = useCallback(
    async (emailId: string, event: React.MouseEvent) => {
      captureEvent('email_archive_clicked', { email_id: emailId });
      const visibleEmails = emails.filter(email => !email.isArchived);
      const archivedIndex = visibleEmails.findIndex(email => email.id === emailId);
      removeFromSelection(emailId, setSelectedEmailIds);
      await handleArchiveBase(emailId, event);
      if (splitView?.selectedEmailId === emailId) {
        navigateSplitViewAfterRemove(emailId, archivedIndex, visibleEmails, splitView, setSelectedEmailIndex);
      }
    },
    [handleArchiveBase, setSelectedEmailIds, emails, splitView, setSelectedEmailIndex]
  );

  const handleBlockSender = useCallback(
    (emailId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      captureEvent('email_block_sender_clicked', { email_id: emailId });
      const emailToBlock = emails.find(event => event.id === emailId);
      if (!emailToBlock) {
        return;
      }
      onShowBlockConfirm(emailToBlock);
    },
    [emails, onShowBlockConfirm]
  );

  const bulkActions = useBulkEmailActions({
    selectedEmailIds,
    setSelectedEmailIds,
    handleArchive,
    handleSetStarCount,
    handleBulkMarkAsRead,
    handleBulkMarkAsUnread,
    onTabCountsUpdateOptimistically,
    mode,
  });

  const { confirmBlockSender } = useBlockSender({
    emails,
    setEmails,
    blockConfirmEmail,
    onHideBlockConfirm,
    fetchEmails,
  });

  const handleSnooze = useCallback(
    async (emailId: string) => {
      const duration = snoozeInput.getSnoozeValue(emailId)?.trim();
      if (!duration) {
        console.warn('Cannot snooze: duration is empty');
        return;
      }
      captureEvent('email_snooze_confirmed', { email_id: emailId, snooze_input_length: duration.length });
      const visibleEmails = emails.filter(email => !email.isArchived);
      const snoozedIndex = visibleEmails.findIndex(email => email.id === emailId);
      snoozeInput.clearSnooze(emailId);
      removeFromSelection(emailId, setSelectedEmailIds);
      handleSnoozeBase(emailId, duration);
      if (splitView?.selectedEmailId === emailId) {
        navigateSplitViewAfterRemove(emailId, snoozedIndex, visibleEmails, splitView, setSelectedEmailIndex);
      } else if (emailListRef?.current && snoozedIndex >= 0 && visibleEmails.length > 1) {
        const nextIndex = snoozedIndex < visibleEmails.length - 1 ? snoozedIndex : Math.max(0, snoozedIndex - 1);
        scrollToEmailAtIndex(emailListRef, nextIndex, setSelectedEmailIndex);
      }
    },
    [snoozeInput, handleSnoozeBase, emails, splitView, emailListRef, setSelectedEmailIndex, setSelectedEmailIds]
  );

  return {
    handleSetStarCount,
    handleArchive,
    handleBlockSender,
    confirmBlockSender,
    handleSnooze,
    ...bulkActions,
  };
}
