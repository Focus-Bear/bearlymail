import { useEffect, useRef } from 'react';

import { INBOX_ARCHIVE_ALL_CATEGORY_EVENT, KEY_BACKSPACE, KEY_DELETE } from 'constants/strings';

interface UseCategoryArchiveAllHotkeyParams {
  /** The most-recently-opened category accordion — the Delete target. Null when none is active. */
  activeCategoryKey: string | null;
  /**
   * True when an email is keyboard-focused/selected (arrow nav, multi-select, or split view). The
   * email-level Delete shortcut (useKeyboardShortcuts) owns that case, so we defer to it and only
   * arm the category Archive-All when no email is the target.
   */
  emailKeyboardActive: boolean;
}

/** Whether the keydown originated from a field the user is typing into — Delete must be ignored there. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Pressing Delete (or Backspace) while a category accordion is open — and no email is focused and
 * the user isn't typing in an input — arms that category's "Archive All" confirmation, exactly as
 * clicking the Archive All button does (the existing Y-to-confirm flow still applies). We signal the
 * active accordion via a window CustomEvent so it can reuse its own confirmation state rather than
 * threading callbacks through the inbox component tree.
 */
export function useCategoryArchiveAllHotkey({
  activeCategoryKey,
  emailKeyboardActive,
}: UseCategoryArchiveAllHotkeyParams): void {
  const activeKeyRef = useRef(activeCategoryKey);
  activeKeyRef.current = activeCategoryKey;
  const emailActiveRef = useRef(emailKeyboardActive);
  emailActiveRef.current = emailKeyboardActive;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== KEY_DELETE && event.key !== KEY_BACKSPACE) {
        return;
      }
      // Another handler (modal, dropdown, etc.) already consumed this key — don't double-handle it.
      if (event.defaultPrevented) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      // An email is focused/selected — let the email-level Delete shortcut handle it instead.
      if (emailActiveRef.current) {
        return;
      }
      const categoryKey = activeKeyRef.current;
      if (!categoryKey) {
        return;
      }
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, { detail: { categoryKey } })
      );
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
