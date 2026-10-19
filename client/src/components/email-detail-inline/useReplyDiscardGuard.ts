import React, { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';

import { KEY_ESCAPE } from 'constants/strings';
import { useUnsavedChangesGuard } from 'hooks/useUnsavedChangesGuard';

const isTextInputTarget = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLSelectElement;

interface UseReplyDiscardGuardOptions {
  hasUnsentChanges: boolean;
  /** Closes the composer and clears its state. */
  closeComposer: () => void;
  saveDraft: () => Promise<void> | void;
  discardDraft: () => Promise<void> | void;
}

/**
 * Asks before a reply with unsent changes is closed (✕, Cancel, Esc via
 * `handleEscapeKeyDown` on the composer) or left
 * through an in-app link, and handles reload/tab close via beforeunload. The
 * caller renders the dialog from `isConfirmOpen` and wires its three buttons.
 */
export function useReplyDiscardGuard({
  hasUnsentChanges,
  closeComposer,
  saveDraft,
  discardDraft,
}: UseReplyDiscardGuardOptions) {
  const [isClosePending, setIsClosePending] = useState(false);
  const { pendingPath, confirmNavigation, cancelNavigation } = useUnsavedChangesGuard(hasUnsentChanges);

  const requestClose = useCallback(() => {
    if (!hasUnsentChanges) {
      closeComposer();
      return;
    }
    setIsClosePending(true);
  }, [hasUnsentChanges, closeComposer]);

  const keepEditing = useCallback(() => {
    setIsClosePending(false);
    cancelNavigation();
  }, [cancelNavigation]);

  const leave = useCallback(
    async (settleDraft: () => Promise<void> | void) => {
      const isNavigating = pendingPath !== null;
      setIsClosePending(false);
      await settleDraft();
      // Commit the close before navigating. Switching emails re-saves whatever
      // draft was open, so navigating in the same render would bring back a
      // draft the user just discarded.
      flushSync(closeComposer);
      if (isNavigating) {
        confirmNavigation();
      }
    },
    [pendingPath, closeComposer, confirmNavigation]
  );

  const saveAndLeave = useCallback(() => leave(saveDraft), [leave, saveDraft]);
  const discardAndLeave = useCallback(() => leave(discardDraft), [leave, discardDraft]);
  const isConfirmOpen = isClosePending || pendingPath !== null;

  // Esc inside a text input already means "dismiss" there (e.g. contact
  // suggestions), so only Esc from elsewhere in the composer closes it.
  const handleEscapeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== KEY_ESCAPE || event.defaultPrevented || isConfirmOpen || isTextInputTarget(event.target)) {
        return;
      }
      event.preventDefault();
      requestClose();
    },
    [isConfirmOpen, requestClose]
  );

  return {
    isConfirmOpen,
    requestClose,
    handleEscapeKeyDown,
    keepEditing,
    saveAndLeave,
    discardAndLeave,
  };
}
