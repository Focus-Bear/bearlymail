import { MutableRefObject, useEffect, useCallback, useState, useRef } from 'react';
import { Email } from 'types/email';
import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_J, KEY_K, KEY_DELETE, KEY_BACKSPACE, KEY_E, KEY_Y, KEY_N, KEY_ESCAPE } from 'constants/strings';

// Time in ms before archive confirmation is cancelled
const ARCHIVE_CONFIRM_TIMEOUT = 3000;

// Pure helpers extracted to reduce handleKeyDown statement count.

function scrollEmailIntoView(index: number, emailListRef: MutableRefObject<HTMLDivElement | null>): void {
  if (!emailListRef?.current) return;
  setTimeout(() => {
    const el = emailListRef.current?.querySelector(`[data-email-index="${index}"]`) as HTMLElement;
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, 0);
}

function buildArchiveTargetIds(
  splitViewSelectedEmailId: string | undefined,
  selectedEmailIds: Set<string>,
  selectedEmailIndex: number,
  visibleEmails: Email[],
): { emailIds: string[]; isSplitView: boolean } {
  if (splitViewSelectedEmailId) {
    return { emailIds: [splitViewSelectedEmailId], isSplitView: true };
  }
  if (selectedEmailIds.size > 0) {
    return { emailIds: Array.from(selectedEmailIds), isSplitView: false };
  }
  const emailToArchive = selectedEmailIndex >= 0 ? visibleEmails[selectedEmailIndex] : undefined;
  return emailToArchive ? { emailIds: [emailToArchive.id], isSplitView: false } : { emailIds: [], isSplitView: false };
}

interface PendingArchiveState { emailIds: string[]; isSplitView: boolean; }

function scheduleArchiveWithConfirmation(
  archiveState: PendingArchiveState,
  setPendingArchive: (state: PendingArchiveState | null) => void,
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  setPendingArchive(archiveState);
  if (timeoutRef.current) { clearTimeout(timeoutRef.current); }
  timeoutRef.current = setTimeout(() => { setPendingArchive(null); }, ARCHIVE_CONFIRM_TIMEOUT);
}

interface UseKeyboardShortcutsProps {
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  onArchive: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount: (emailId: string, starCount: number) => void;
  enabled?: boolean;
  emailListRef?: React.RefObject<HTMLDivElement | null>;
  emailDetailRef?: React.RefObject<HTMLDivElement | null>;
  splitViewSelectedEmailId?: string | null;
  onSplitViewArchive?: (emailId: string) => void;
}

export interface UseKeyboardShortcutsResult {
  pendingArchive: PendingArchiveState | null;
  cancelPendingArchive: () => void;
}

/**
 * Check if an element or its ancestors have contenteditable attribute.
 * The isContentEditable property already handles ancestor checking.
 */
function isContentEditableElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  return element.isContentEditable;
}

export function useKeyboardShortcuts({
  emails,
  selectedEmailIndex,
  selectedEmailIds,
  setSelectedEmailIndex,
  onArchive,
  onSetStarCount,
  enabled = true,
  emailListRef,
  emailDetailRef,
  splitViewSelectedEmailId,
  onSplitViewArchive,
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsResult {
  // Track pending archive confirmation state
  const [pendingArchive, setPendingArchive] = useState<PendingArchiveState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cancel pending archive
  const cancelPendingArchive = useCallback(() => {
    setPendingArchive(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Execute the archive action
  const executeArchive = useCallback((archiveState: PendingArchiveState) => {
    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
    
    if (archiveState.isSplitView && archiveState.emailIds.length === 1) {
      if (onSplitViewArchive) {
        onSplitViewArchive(archiveState.emailIds[0]);
      } else {
        onArchive(archiveState.emailIds[0], fakeEvent);
      }
    } else {
      archiveState.emailIds.forEach(emailId => {
        onArchive(emailId, fakeEvent);
      });
      
      // Adjust selected index after archiving for non-split view
      if (!archiveState.isSplitView && selectedEmailIds.size === 0) {
        // Only adjust index when archiving a highlighted email (not checked ones)
        const visibleEmails = emails.filter(email => !email.isArchived);
        if (selectedEmailIndex > 0) {
          setSelectedEmailIndex(selectedEmailIndex - 1);
        } else if (visibleEmails.length > 1) {
          setSelectedEmailIndex(0);
        } else {
          setSelectedEmailIndex(-1);
        }
      }
    }
    
    cancelPendingArchive();
  }, [emails, selectedEmailIndex, selectedEmailIds.size, setSelectedEmailIndex, onArchive, onSplitViewArchive, cancelPendingArchive]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input or contenteditable element (like Tiptap rich text editor)
    if (
      e.target instanceof HTMLInputElement || 
      e.target instanceof HTMLTextAreaElement ||
      isContentEditableElement(e.target)
    ) {
      return;
    }

    // Handle pending archive confirmation
    if (pendingArchive) {
      if (e.key === KEY_Y) {
        e.preventDefault();
        executeArchive(pendingArchive);
        return;
      } else if (e.key === KEY_ESCAPE || e.key === KEY_N) {
        e.preventDefault();
        cancelPendingArchive();
        return;
      } else {
        // Any other key cancels the pending archive
        cancelPendingArchive();
        // Don't return - let the key be processed normally
      }
    }

    // Filter out archived emails to match visible list
    const visibleEmails = emails.filter(email => !email.isArchived);

    // Arrow navigation
    if (e.key === KEY_ARROW_DOWN || e.key === KEY_J) {
      e.preventDefault();
      const newIndex = Math.min(selectedEmailIndex + 1, visibleEmails.length - 1);
      setSelectedEmailIndex(newIndex);
      scrollEmailIntoView(newIndex, emailListRef);
    } else if (e.key === KEY_ARROW_UP || e.key === KEY_K) {
      e.preventDefault();
      const newIndex = Math.max(selectedEmailIndex - 1, 0);
      setSelectedEmailIndex(newIndex);
      scrollEmailIntoView(newIndex, emailListRef);
    }

    // Star shortcuts (1, 2, 3) and clear star (0)
    if ((['1', '2', '3', '0'].includes(e.key)) && selectedEmailIds.size > 0) {
      e.preventDefault();
      const starCount = parseInt(e.key);
      selectedEmailIds.forEach(emailId => { onSetStarCount(emailId, starCount); });
    }

    // Archive (Delete, Backspace, or 'e') - now requires confirmation
    if (e.key === KEY_DELETE || e.key === KEY_BACKSPACE || e.key === KEY_E) {
      const { emailIds: emailIdsToArchive, isSplitView } = buildArchiveTargetIds(splitViewSelectedEmailId, selectedEmailIds, selectedEmailIndex, visibleEmails);
      if (emailIdsToArchive.length > 0) {
        e.preventDefault();
        scheduleArchiveWithConfirmation({ emailIds: emailIdsToArchive, isSplitView }, setPendingArchive, timeoutRef);
      }
    }
  }, [emails, selectedEmailIndex, selectedEmailIds, setSelectedEmailIndex, onSetStarCount, emailListRef, splitViewSelectedEmailId, pendingArchive, executeArchive, cancelPendingArchive]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    pendingArchive,
    cancelPendingArchive,
  };
}
