import { MAX_PENDING_EDITOR_ECHOES } from 'constants/numbers';
import { TAG_EMPTY_PARAGRAPH } from 'constants/strings';

/**
 * Decides when the controlled `content` prop may be written back into the TipTap
 * editor, so the caret only moves for genuinely external content (draft restore,
 * a picked reply option, a tone-check revision) and never for the user's own typing.
 *
 * The reply composer round-trips every keystroke: the editor emits HTML via
 * onUpdate → the parent stores it as `content` → it flows back here. The parent
 * debounces that store (useEmailDetailDraftHandlers, #978), so the prop arrives
 * up to a few hundred milliseconds — and often several keystrokes — behind the
 * editor. Comparing the prop against only the LAST emitted value treated every
 * such stale echo as an external change and wrote it back with setContent,
 * deleting whatever had been typed since and jumping the caret to the end.
 * Safari (desktop and iOS) hit it constantly because React flushes the effect in
 * a later task, after queued keystrokes have already reached the editor.
 *
 * So the tracker remembers every value the editor emitted that the parent has not
 * echoed yet, and ignores any of them when they come back. It also only reacts
 * when the prop actually CHANGES: a reconcile triggered by something else (the
 * compositionend re-sync, a re-render) must not re-apply a prop the editor has
 * already moved past.
 */
export interface ContentSyncTracker {
  /** Records HTML the editor just emitted through onChange. */
  recordEmitted(html: string): void;
  /**
   * Returns the content to write into the editor, or null when the incoming prop
   * must leave the editor alone (unchanged, mid-composition, or an echo).
   * `getCurrentContent` is a thunk so the costly editor.getHTML() serialization
   * only runs for genuinely external changes.
   */
  takeExternalContent(params: {
    incomingContent: string | null;
    composing: boolean;
    getCurrentContent: () => string;
  }): string | null;
}

function isEmptyEditorHtml(html: string): boolean {
  return html === '' || html === TAG_EMPTY_PARAGRAPH;
}

export function createContentSyncTracker(initialContent: string | null): ContentSyncTracker {
  let lastSeenContent = initialContent || '';
  let pendingEchoes: string[] = [];

  return {
    recordEmitted(html) {
      pendingEchoes.push(html);
      // A parent that never echoes (uncontrolled use) must not grow this forever.
      if (pendingEchoes.length > MAX_PENDING_EDITOR_ECHOES) {
        pendingEchoes.shift();
      }
    },

    takeExternalContent({ incomingContent, composing, getCurrentContent }) {
      const value = incomingContent || '';
      if (value === lastSeenContent) {
        return null;
      }
      // Replacing the focused text node mid-composition (IME / macOS emoji picker /
      // mobile predictive text) aborts it and drops the character. lastSeenContent
      // is left alone so the compositionend re-sync still applies this change.
      if (composing) {
        return null;
      }
      lastSeenContent = value;

      // Echoes arrive in emission order, so anything emitted before this one is
      // superseded and can no longer come back as a legitimate echo.
      const echoIndex = pendingEchoes.indexOf(value);
      if (echoIndex !== -1) {
        pendingEchoes = pendingEchoes.slice(echoIndex + 1);
        return null;
      }

      pendingEchoes = [];
      const currentContent = getCurrentContent();
      if (isEmptyEditorHtml(currentContent) && isEmptyEditorHtml(value)) {
        return null;
      }
      return currentContent === value ? null : value;
    },
  };
}
