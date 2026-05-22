import { useRef } from 'react';

import { DEBOUNCE_DELAY_MS } from 'constants/numbers';
import { ACTION_TYPE_CUSTOM } from 'constants/strings';

interface ReplyOption {
  label: string;
  text: string;
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
 *
 * Fix #978: `setDraft` is debounced (300 ms) so that lifting draft content up to the
 * root EmailDetail state does not happen on every single keystroke. Typing lag was caused
 * by the full component tree (including EmailThreadView with expensive DOMParser work)
 * re-rendering on every character. The TipTap editor manages its own content internally;
 * the React draft state is only needed by the send handler and auto-save, which tolerate
 * a short delay. `customDraftRef` still updates synchronously so tab-switching stays
 * correct.
 */
export function useEmailDetailDraftHandlers(options: {
  replyOptions: ReplyOption[] | null;
  setDraft: (d: string) => void;
  setSelectedReplyOption: (idx: number) => void;
  setReplyOptions: (opts: ReplyOption[] | null) => void;
  setToneCheckResult: (
    r: { isOk: boolean; suggestions: string[]; revisedText?: string; inappropriateTiming?: string | null } | null
  ) => void;
  setShowReplyComposer: (show: boolean) => void;
}) {
  const { replyOptions, setDraft, setSelectedReplyOption, setReplyOptions, setToneCheckResult, setShowReplyComposer } =
    options;
  // Preserve user-typed content in the Custom tab across suggestion tab switches (fixes #562).
  const customDraftRef = useRef<string>('');

  // When true, the draft change was triggered programmatically by option selection, not
  // by the user typing. handleDraftChange must not reset the active tab in this case
  // (fixes #886).
  const isSelectingOptionRef = useRef<boolean>(false);

  // Pending debounce timer for setDraft (fixes #978).
  const draftDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDraftDebounce = () => {
    if (draftDebounceTimerRef.current !== null) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
  };

  const handleDraftChange = (newDraft: string) => {
    // Only persist to customDraftRef when the user is typing, not when Tiptap fires
    // onUpdate because we programmatically called setContent for a suggestion tab.
    // Without this guard, clicking Negative overwrites the user's custom draft in the
    // ref, so switching back to Custom restores the suggestion text instead.
    if (!isSelectingOptionRef.current) {
      customDraftRef.current = newDraft;
    }
    setToneCheckResult(null);
    if (replyOptions && !isSelectingOptionRef.current) {
      const customIdx = replyOptions.findIndex(opt => opt.label === ACTION_TYPE_CUSTOM);
      // If the current tab is not already the Custom tab, switch to it.
      if (customIdx >= 0) {
        setSelectedReplyOption(customIdx);
      }
    }

    // Debounce the expensive React state update (#978). The TipTap editor stores the
    // content internally; we only need the React state to be current when the user
    // pauses or sends, so 300 ms of latency is imperceptible.
    cancelDraftDebounce();
    draftDebounceTimerRef.current = setTimeout(() => {
      draftDebounceTimerRef.current = null;
      setDraft(newDraft);
    }, DEBOUNCE_DELAY_MS);
  };

  const handleReplyOptionSelect = (idx: number, text: string) => {
    // Cancel any pending debounce so a queued keystroke setDraft doesn't override
    // the programmatically selected option text immediately after selection.
    cancelDraftDebounce();
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
      // Clear the flag after React's effects have run (setTimeout fires after
      // React's MessageChannel scheduler), so the Tiptap onUpdate cascade that
      // happens inside setContent() still sees isSelectingOptionRef = true and
      // does not switch the tab back to Custom.
      setTimeout(() => {
        isSelectingOptionRef.current = false;
      }, 0);
    }
  };

  const handleReplyClose = () => {
    // Cancel any pending debounce to avoid setting stale draft state after close.
    cancelDraftDebounce();
    setShowReplyComposer(false);
    setDraft('');
    setReplyOptions(null);
    setSelectedReplyOption(-1);
    setToneCheckResult(null);
    customDraftRef.current = '';
  };

  return { customDraftRef, handleDraftChange, handleReplyOptionSelect, handleReplyClose };
}
