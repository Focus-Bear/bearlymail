import React, { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Email } from 'types/email';

import {
  KEY_ARROW_DOWN,
  KEY_ARROW_UP,
  KEY_BACKSPACE,
  KEY_DELETE,
  KEY_E,
  KEY_ESCAPE,
  KEY_J,
  KEY_K,
  KEY_N,
  KEY_Y,
} from 'constants/strings';

// Time in ms before archive confirmation is cancelled
const ARCHIVE_CONFIRM_TIMEOUT = 3000;

// Pure helpers extracted to reduce handleKeyDown statement count.

function scrollEmailIntoView(index: number, emailListRef: React.RefObject<HTMLDivElement | null> | undefined): void {
  if (!emailListRef?.current) {
    return;
  }
  setTimeout(() => {
    const el = emailListRef.current?.querySelector(`[data-email-index="${index}"]`) as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 0);
}

function buildArchiveTargetIds(
  splitViewSelectedEmailId: string | null | undefined,
  selectedEmailIds: Set<string>,
  selectedEmailIndex: number,
  visibleEmails: Email[]
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

interface PendingArchiveState {
  emailIds: string[];
  isSplitView: boolean;
}

function scheduleArchiveWithConfirmation(
  archiveState: PendingArchiveState,
  setPendingArchive: (state: PendingArchiveState | null) => void,
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
): void {
  setPendingArchive(archiveState);
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }
  timeoutRef.current = setTimeout(() => {
    setPendingArchive(null);
  }, ARCHIVE_CONFIRM_TIMEOUT);
}

interface ExecuteArchiveParams {
  archiveState: PendingArchiveState;
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  onArchive: (emailId: string, event: React.MouseEvent) => void;
  onSplitViewArchive?: (emailId: string) => void;
  cancelPendingArchive: () => void;
}

function executeArchiveAction({
  archiveState,
  emails,
  selectedEmailIndex,
  selectedEmailIds,
  setSelectedEmailIndex,
  onArchive,
  onSplitViewArchive,
  cancelPendingArchive,
}: ExecuteArchiveParams): void {
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
    if (!archiveState.isSplitView && selectedEmailIds.size === 0) {
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
}

interface UseKeyboardShortcutsProps {
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  onArchive: (emailId: string, event: React.MouseEvent) => void;
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

/**
 * Handle a keydown event when there is a pending archive awaiting confirmation.
 * Returns true if the event was consumed (caller should stop processing), false otherwise.
 */
function handlePendingArchiveKey(
  event: KeyboardEvent,
  pendingArchive: PendingArchiveState,
  executeArchiveParams: Omit<ExecuteArchiveParams, 'archiveState'>,
  cancelPendingArchive: () => void
): boolean {
  if (event.key === KEY_Y) {
    event.preventDefault();
    executeArchiveAction({ archiveState: pendingArchive, ...executeArchiveParams });
    return true;
  }
  if (event.key === KEY_ESCAPE || event.key === KEY_N) {
    event.preventDefault();
    cancelPendingArchive();
    return true;
  }
  // Any other key cancels the pending archive but lets it be processed normally
  cancelPendingArchive();
  return false;
}

/**
 * Manages the pending archive confirmation state (two-keystroke archive flow).
 * Extracted from useKeyboardShortcuts to keep that hook under the
 * max-lines-per-function limit.
 */
function useArchiveConfirmation() {
  const [pendingArchive, setPendingArchive] = useState<PendingArchiveState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingArchive = useCallback(() => {
    setPendingArchive(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const requestArchiveConfirmation = useCallback((archiveState: PendingArchiveState) => {
    scheduleArchiveWithConfirmation(archiveState, setPendingArchive, timeoutRef);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { pendingArchive, setPendingArchive, cancelPendingArchive, requestArchiveConfirmation };
}

/**
 * Registers a keydown event listener on window and cleans it up on unmount or dep change.
 * Extracted from useKeyboardShortcuts to keep that hook under the
 * max-lines-per-function limit.
 */
function useKeyDownRegistration(handleKeyDown: (event: KeyboardEvent) => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
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
  splitViewSelectedEmailId,
  onSplitViewArchive,
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsResult {
  const { pendingArchive, cancelPendingArchive, requestArchiveConfirmation } = useArchiveConfirmation();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if typing in an input or contenteditable element (like Tiptap rich text editor)
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        isContentEditableElement(event.target)
      ) {
        return;
      }

      // Handle pending archive confirmation
      if (pendingArchive) {
        const consumed = handlePendingArchiveKey(
          event,
          pendingArchive,
          {
            emails,
            selectedEmailIndex,
            selectedEmailIds,
            setSelectedEmailIndex,
            onArchive,
            onSplitViewArchive,
            cancelPendingArchive,
          },
          cancelPendingArchive
        );
        if (consumed) {
          return;
        }
      }

      // Filter out archived emails to match visible list
      const visibleEmails = emails.filter(email => !email.isArchived);

      // Arrow navigation
      if (event.key === KEY_ARROW_DOWN || event.key === KEY_J) {
        event.preventDefault();
        const newIndex = Math.min(selectedEmailIndex + 1, visibleEmails.length - 1);
        setSelectedEmailIndex(newIndex);
        scrollEmailIntoView(newIndex, emailListRef);
      } else if (event.key === KEY_ARROW_UP || event.key === KEY_K) {
        event.preventDefault();
        const newIndex = Math.max(selectedEmailIndex - 1, 0);
        setSelectedEmailIndex(newIndex);
        scrollEmailIntoView(newIndex, emailListRef);
      }

      // Star shortcuts (1, 2, 3) and clear star (0)
      if (['1', '2', '3', '0'].includes(event.key) && selectedEmailIds.size > 0) {
        event.preventDefault();
        const starCount = parseInt(event.key);
        selectedEmailIds.forEach(emailId => {
          onSetStarCount(emailId, starCount);
        });
      }

      // Archive (Delete, Backspace, or 'e') - requires confirmation via second keypress
      if (event.key === KEY_DELETE || event.key === KEY_BACKSPACE || event.key === KEY_E) {
        const { emailIds: emailIdsToArchive, isSplitView } = buildArchiveTargetIds(
          splitViewSelectedEmailId,
          selectedEmailIds,
          selectedEmailIndex,
          visibleEmails
        );
        if (emailIdsToArchive.length > 0) {
          event.preventDefault();
          requestArchiveConfirmation({ emailIds: emailIdsToArchive, isSplitView });
        }
      }
    },
    [
      emails,
      selectedEmailIndex,
      selectedEmailIds,
      setSelectedEmailIndex,
      onArchive,
      onSetStarCount,
      emailListRef,
      splitViewSelectedEmailId,
      onSplitViewArchive,
      pendingArchive,
      cancelPendingArchive,
      requestArchiveConfirmation,
    ]
  );

  useKeyDownRegistration(handleKeyDown, enabled);

  return { pendingArchive, cancelPendingArchive };
}
