import { useRef } from 'react';

import { ACTION_TYPE_CUSTOM } from 'constants/strings';

interface ReplyOption {
  label: string;
  text?: string;
}

/**
 * Extracts the duplicate draft-handler logic that previously existed verbatim in both
 * `EmailDetail` (via the local `EmailDetailContent` sub-component) and `EmailDetailInline`
 * (via `useEmailDetailInlineHandlers`). Fixes #698.
 *
 * Handles:
 * - Persisting user-typed content in the Custom reply tab across suggestion-tab switches
 * - Restoring that content when the user switches back to the Custom tab
 * - Clearing draft state on reply-composer close
 *
 * Fix #886: `isSelectingOptionRef` prevents the Tiptap onUpdate cascade from resetting
 * the active tab back to "Custom" immediately after `handleReplyOptionSelect` sets a
 * non-Custom option. The flag is set synchronously before `setDraft(text)` (which
 * triggers the cascade) and cleared in a microtask so any synchronous Tiptap callbacks
 * in the same tick still observe it as true.
 */
export function useEmailDetailDraftHandlers(
  replyOptions: ReplyOption[] | null,
  setDraft: (d: string) => void,
  setSelectedReplyOption: (idx: number) => void,
  setReplyOptions: (opts: ReplyOption[] | null) => void,
  setToneCheckResult: (r: any) => void,
  setShowReplyComposer: (show: boolean) => void
) {
  // Preserve user-typed content in the Custom tab across suggestion tab switches (fixes #562).
  const customDraftRef = useRef<string>('');

  // When true, the draft change was triggered programmatically by option selection, not
  // by the user typing. handleDraftChange must not reset the active tab in this case
  // (fixes #886).
  const isSelectingOptionRef = useRef<boolean>(false);

  const handleDraftChange = (newDraft: string) => {
    setDraft(newDraft);
    setToneCheckResult(null);
    // Always persist user input so it can be restored if they switch to a suggestion and come back.
    customDraftRef.current = newDraft;
    if (replyOptions && !isSelectingOptionRef.current) {
      const customIdx = replyOptions.findIndex(opt => opt.label === ACTION_TYPE_CUSTOM);
      // If the current tab is not already the Custom tab, switch to it.
      if (customIdx >= 0) {
        setSelectedReplyOption(customIdx);
      }
    }
  };

  const handleReplyOptionSelect = (idx: number, text: string) => {
    const customIdx = replyOptions?.findIndex(opt => opt.label === ACTION_TYPE_CUSTOM) ?? 0;
    if (idx === customIdx) {
      // User is switching back to the Custom tab — restore their previously typed content.
      setSelectedReplyOption(idx);
      setDraft(customDraftRef.current);
    } else {
      // Set the flag before setDraft so the Tiptap onUpdate cascade (which fires
      // synchronously within the same tick) sees isSelectingOptionRef.current === true
      // and skips the reset to Custom.
      isSelectingOptionRef.current = true;
      setSelectedReplyOption(idx);
      setDraft(text);
      // Clear the flag after the current microtask so normal user-typing events
      // continue to switch the tab to Custom as expected.
      Promise.resolve().then(() => {
        isSelectingOptionRef.current = false;
      });
    }
  };

  const handleReplyClose = () => {
    setShowReplyComposer(false);
    setDraft('');
    setReplyOptions(null);
    setToneCheckResult(null);
    customDraftRef.current = '';
  };

  return { customDraftRef, handleDraftChange, handleReplyOptionSelect, handleReplyClose };
}
