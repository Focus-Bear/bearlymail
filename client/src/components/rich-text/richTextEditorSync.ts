import { TAG_EMPTY_PARAGRAPH } from 'constants/strings';

export interface ContentSyncDecision {
  /** Whether the incoming content should be written into the editor via setContent. */
  shouldSync: boolean;
  /** The normalized content value that would be applied. */
  value: string;
}

/**
 * Decides whether the controlled `content` prop should be written back into the
 * TipTap editor.
 *
 * The reply composer round-trips every keystroke: the editor emits HTML via
 * onUpdate → the parent stores it as `content` → it flows straight back here.
 * Writing that echo back into the editor with setContent resets the caret to
 * the end of the document. On desktop the echo serializes identically so the
 * `currentContent !== value` guard skips it; but on mobile predictive keyboards
 * the composed `getHTML()` differs from the emitted value at reconcile time, so
 * setContent fired on nearly every keystroke — jumping the caret to the end and
 * re-serializing the whole document (lag).
 *
 * We recognise the echo by comparing the incoming content against the last value
 * the editor emitted (`lastEmitted`) and skip it — so the caret only ever moves
 * for genuinely external content changes (draft restore, a picked reply option,
 * a tone-check revision). `getCurrentContent` is a thunk so the expensive
 * editor.getHTML() serialization is skipped entirely for the common echo case.
 */
export function decideContentSync(params: {
  incomingContent: string | null;
  lastEmitted: string;
  composing: boolean;
  getCurrentContent: () => string;
}): ContentSyncDecision {
  const { incomingContent, lastEmitted, composing, getCurrentContent } = params;
  const value = incomingContent || '';

  // Never reconcile mid-composition (IME / macOS emoji picker): replacing the
  // focused text node aborts the composition and drops the character. The caller
  // re-syncs on compositionend.
  if (composing) {
    return { shouldSync: false, value };
  }

  // Echo of the editor's own output — skip before serializing the document so
  // the caret is never reset by the user's own typing.
  if (value === lastEmitted) {
    return { shouldSync: false, value };
  }

  const currentContent = getCurrentContent();
  const editorIsEmpty = currentContent === TAG_EMPTY_PARAGRAPH || currentContent === '';
  const contentIsEmpty = !value || value === TAG_EMPTY_PARAGRAPH;
  if (editorIsEmpty && contentIsEmpty) {
    return { shouldSync: false, value };
  }

  return { shouldSync: currentContent !== value, value };
}
