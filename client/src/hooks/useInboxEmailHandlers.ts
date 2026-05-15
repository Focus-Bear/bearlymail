import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Email, InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { useInboxKeyboardNavigation } from 'hooks/useInboxKeyboardNavigation';
import { useKeyboardShortcuts } from 'hooks/useKeyboardShortcuts';
import { useSplitView } from 'hooks/useSplitView';

interface EmailHandlerParams {
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  handleEmailClickBase: (emailId: string, index: number, event: React.MouseEvent, emails: Email[]) => void;
  handleArchiveBase: (emailId: string, event: React.MouseEvent) => void;
  handleSetStarCountBase: (emailId: string, count: number) => void;
  handleMarkAsRead: (emailId: string) => void;
  splitView: ReturnType<typeof useSplitView>;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  emailDetailRef: React.RefObject<HTMLDivElement | null>;
  navigate: ReturnType<typeof useNavigate>;
  mode: InboxMode;
  basePath: string;
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
  basePath,
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
    (emailId: string, _event: React.MouseEvent | KeyboardEvent, categoryIndex?: number) => {
      captureEvent(ANALYTICS_EVENTS.EMAIL_CLICKED, { email_id: emailId, mode });
      if (splitView.isMobile) {
        handleMarkAsRead(emailId);
        navigate(`/email/${emailId}`, { state: { fromMode: mode, fromBasePath: basePath } });
      } else {
        handleMarkAsRead(emailId);
        splitView.openEmail(emailId);
        // Use the category view index passed from the click handler.
        // When called from keyboard Enter, categoryIndex is undefined and selectedEmailIndex
        // is already correct from arrow key navigation — leave it unchanged.
        if (categoryIndex !== undefined) {
          setSelectedEmailIndex(categoryIndex);
        }
      }
    },
    [splitView, handleMarkAsRead, navigate, mode, basePath, setSelectedEmailIndex]
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
