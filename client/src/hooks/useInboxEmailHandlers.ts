import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { useInboxKeyboardNavigation } from 'hooks/useInboxKeyboardNavigation';
import { useKeyboardShortcuts } from 'hooks/useKeyboardShortcuts';

interface EmailHandlerParams {
  emails: any[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  handleEmailClickBase: (emailId: string, index: number, event: React.MouseEvent, emails: any[]) => void;
  handleArchiveBase: (emailId: string, event: React.MouseEvent) => void;
  handleSetStarCountBase: (emailId: string, count: number) => void;
  handleMarkAsRead: (emailId: string) => void;
  splitView: { isMobile: boolean; selectedEmailId?: string; openEmail: (id: string) => void; closeEmail: () => void };
  emailListRef: React.RefObject<HTMLDivElement>;
  emailDetailRef: React.RefObject<HTMLDivElement>;
  navigate: ReturnType<typeof useNavigate>;
  mode: InboxMode;
}

/**
 * Email interaction handlers: click, select, archive via keyboard.
 * Also registers keyboard shortcuts and keyboard navigation.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxEmailHandlers({
  emails,
  selectedEmailIndex,
  selectedEmailIds,
  setSelectedEmailIndex,
  handleEmailClickBase,
  handleArchiveBase,
  handleSetStarCountBase,
  handleMarkAsRead,
  splitView,
  emailListRef,
  emailDetailRef,
  navigate,
  mode,
}: EmailHandlerParams) {
  const handleSplitViewArchiveFromKeyboard = useCallback(
    (archivedEmailId: string) => {
      const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
      handleArchiveBase(archivedEmailId, fakeEvent);
      const visibleEmails = emails.filter(event => !event.isArchived && event.id !== archivedEmailId);
      if (visibleEmails.length === 0) {
        splitView.closeEmail();
        return;
      }
      const currentIndex = selectedEmailIndex >= 0 ? selectedEmailIndex : 0;
      const nextIndex = currentIndex < visibleEmails.length ? currentIndex : Math.max(0, visibleEmails.length - 1);
      const nextEmail = visibleEmails[nextIndex];
      if (nextEmail) {
        splitView.openEmail(nextEmail.id);
        setSelectedEmailIndex(nextIndex);
      } else {
        splitView.closeEmail();
      }
    },
    [emails, selectedEmailIndex, handleArchiveBase, splitView, setSelectedEmailIndex]
  );

  const keyboardShortcuts = useKeyboardShortcuts({
    emails,
    selectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIndex,
    onArchive: handleArchiveBase,
    onSetStarCount: handleSetStarCountBase,
    emailListRef,
    emailDetailRef,
    splitViewSelectedEmailId: splitView.selectedEmailId,
    onSplitViewArchive: handleSplitViewArchiveFromKeyboard,
  });

  const handleEmailClick = useCallback(
    (emailId: string, index: number, event: React.MouseEvent) => {
      event.stopPropagation();
      handleEmailClickBase(emailId, index, event, emails);
    },
    [handleEmailClickBase, emails]
  );

  const handleEmailSelect = useCallback(
    (emailId: string, event: React.MouseEvent) => {
      captureEvent('email_clicked', { email_id: emailId, mode });
      if (splitView.isMobile) {
        handleMarkAsRead(emailId);
        navigate(`/email/${emailId}`, { state: { fromMode: mode } });
      } else {
        handleMarkAsRead(emailId);
        splitView.openEmail(emailId);
        const visibleEmails = emails.filter(email => !email.isArchived);
        const emailIndex = visibleEmails.findIndex(email => email.id === emailId);
        if (emailIndex >= 0) {
          setSelectedEmailIndex(emailIndex);
        }
      }
    },
    [splitView, handleMarkAsRead, navigate, mode, emails, setSelectedEmailIndex]
  );

  useInboxKeyboardNavigation({
    emails,
    selectedEmailIndex,
    setSelectedEmailIndex,
    splitView,
    onEmailSelect: handleEmailSelect,
    emailListRef,
    emailDetailRef,
  });

  return { handleSplitViewArchiveFromKeyboard, keyboardShortcuts, handleEmailClick, handleEmailSelect };
}
