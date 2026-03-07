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
 */
export function useEmailDetailDraftHandlers(
  replyOptions: ReplyOption[] | null,
  setDraft: (d: string) => void,
  setSelectedReplyOption: (idx: number) => void,
  setReplyOptions: (opts: ReplyOption[] | null) => void,
  setToneCheckResult: (r: any) => void,
  setShowReplyComposer: (show: boolean) => void,
) {
  // Preserve user-typed content in the Custom tab across suggestion tab switches (fixes #562).
  const customDraftRef = useRef<string>('');

  const handleDraftChange = (newDraft: string) => {
    setDraft(newDraft);
    setToneCheckResult(null);
    // Always persist user input so it can be restored if they switch to a suggestion and come back.
    customDraftRef.current = newDraft;
    if (replyOptions) {
      const customIdx = replyOptions.findIndex((opt) => opt.label === ACTION_TYPE_CUSTOM);
      // If the current tab is not already the Custom tab, switch to it.
      if (customIdx >= 0) setSelectedReplyOption(customIdx);
    }
  };

  const handleReplyOptionSelect = (idx: number, text: string) => {
    const customIdx = replyOptions?.findIndex((opt) => opt.label === ACTION_TYPE_CUSTOM) ?? 0;
    if (idx === customIdx) {
      // User is switching back to the Custom tab — restore their previously typed content.
      setSelectedReplyOption(idx);
      setDraft(customDraftRef.current);
    } else {
      setSelectedReplyOption(idx);
      setDraft(text);
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
