import { useCallback } from 'react';
import { SetStateAction } from 'react';
import { Email, InboxMode } from 'types/email';
import { CategoryArchiveSuggestion } from 'utils/categoryArchiveWorkflow';
import { captureEvent } from 'utils/posthog';

import {
  navigateAfterSplitViewAction,
  pickNextEmailAfterRemoval,
} from 'components/inbox/inboxCategoryHelpers';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { useBlockSender } from 'hooks/useBlockSender';
import { useBulkEmailActions } from 'hooks/useBulkEmailActions';
import { useStarCountHandler } from 'hooks/useStarCountHandler';

type SplitViewRef = { selectedEmailId: string | null; openEmail: (emailId: string) => void; closeEmail: () => void };

const POST_REMOVAL_RERENDER_MS = 100;

/**
 * After the removal re-renders the list, scroll the picked next email into
 * view and sync `selectedEmailIndex` to its freshly-assigned rendered index
 * (the row highlight compares against rendered `data-email-index` values).
 */
function scrollToEmailById(
  emailListRef: React.RefObject<HTMLDivElement | null> | undefined,
  nextEmailId: string,
  setSelectedEmailIndex?: (index: number) => void
): void {
  setTimeout(() => {
    const el = emailListRef?.current?.querySelector(
      `[data-email-id="${CSS.escape(nextEmailId)}"]`
    ) as HTMLElement | null;
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const renderedIndex = Number(el.dataset.emailIndex);
    if (!Number.isNaN(renderedIndex)) {
      setSelectedEmailIndex?.(renderedIndex);
    }
  }, POST_REMOVAL_RERENDER_MS);
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
  onShowStarDiscrepancy: (
    emailId: string,
    userStarCount: number,
    predictedStarCount: number,
    emailSubject?: string
  ) => void;
  onShowPriorityOverride: (
    emailId: string,
    originalPriorityScore: number,
    newPriorityScore: number,
    context?: 'archive' | 'star' | 'manual',
    emailSubject?: string
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
  /** Live view of which category drawers are expanded — post-action navigation must not land on emails hidden in collapsed drawers. */
  expandedCategoriesRef?: React.RefObject<Set<string> | undefined>;
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
  handleCategoryArchiveAll: (emailIds: string[]) => Promise<CategoryArchiveSuggestion | null>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

export function useEmailActions(props: UseEmailActionsProps): UseEmailActionsReturn {
  const {
    mode,
    emails,
    setEmails,
    selectedEmailIds,
    setSelectedEmailIds,
    handleSetStarCountBase,
    handleArchiveBase,
    handleSnoozeBase,
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
    expandedCategoriesRef,
    setSelectedEmailIndex,
    splitView,
    onTabCountsUpdateOptimistically,
  } = props;
  const { handleSetStarCount } = useStarCountHandler({
    emails,
    handleSetStarCountBase,
    onShowStarDiscrepancy,
    onShowPriorityOverride,
  });

  const handleArchive = useCallback(
    async (emailId: string, event: React.MouseEvent) => {
      captureEvent(ANALYTICS_EVENTS.EMAIL_ARCHIVE_CLICKED, { email_id: emailId });
      removeFromSelection(emailId, setSelectedEmailIds);
      await handleArchiveBase(emailId, event);
      if (splitView?.selectedEmailId === emailId) {
        // Navigate in DISPLAY order (category-grouped), not flat fetch order —
        // the flat list points at an email in a different drawer entirely.
        navigateAfterSplitViewAction(
          emailId,
          emails,
          mode,
          splitView,
          index => setSelectedEmailIndex?.(index),
          expandedCategoriesRef?.current
        );
      }
    },
    [handleArchiveBase, setSelectedEmailIds, emails, mode, splitView, expandedCategoriesRef, setSelectedEmailIndex]
  );

  const handleBlockSender = useCallback(
    (emailId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      captureEvent(ANALYTICS_EVENTS.EMAIL_BLOCK_SENDER_CLICKED, { email_id: emailId });
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
      captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CONFIRMED, {
        email_id: emailId,
        snooze_input_length: duration.length,
      });
      snoozeInput.clearSnooze(emailId);
      removeFromSelection(emailId, setSelectedEmailIds);
      handleSnoozeBase(emailId, duration);
      // Navigate in DISPLAY order (category-grouped) — the flat fetch-order
      // list used to send the selection to a different drawer (and scroll to
      // the bottom). `emails` is the pre-removal render snapshot, so picking
      // here still sees the snoozed email's position.
      if (splitView?.selectedEmailId === emailId) {
        navigateAfterSplitViewAction(
          emailId,
          emails,
          mode,
          splitView,
          index => setSelectedEmailIndex?.(index),
          expandedCategoriesRef?.current
        );
      } else {
        const picked = pickNextEmailAfterRemoval(emailId, emails, mode, expandedCategoriesRef?.current);
        if (picked) {
          scrollToEmailById(emailListRef, picked.nextEmailId, setSelectedEmailIndex);
        }
      }
    },
    [snoozeInput, handleSnoozeBase, emails, mode, splitView, emailListRef, expandedCategoriesRef, setSelectedEmailIndex, setSelectedEmailIds]
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
