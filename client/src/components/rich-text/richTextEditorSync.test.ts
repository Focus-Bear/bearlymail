import { createContentSyncTracker } from 'components/rich-text/richTextEditorSync';
import { MAX_PENDING_EDITOR_ECHOES } from 'constants/numbers';
import { TAG_EMPTY_PARAGRAPH } from 'constants/strings';

const reconcile = (
  tracker: ReturnType<typeof createContentSyncTracker>,
  incomingContent: string | null,
  currentContent: string,
  composing = false
) => {
  const getCurrentContent = vi.fn(() => currentContent);
  const externalContent = tracker.takeExternalContent({ incomingContent, composing, getCurrentContent });
  return { externalContent, getCurrentContent };
};

describe('createContentSyncTracker', () => {
  it("skips the echo of the editor's own output without serializing (no caret reset)", () => {
    const tracker = createContentSyncTracker('');
    tracker.recordEmitted('<p>hello worlXd</p>');

    const { externalContent, getCurrentContent } = reconcile(tracker, '<p>hello worlXd</p>', '<p>hello worlXd</p>');

    expect(externalContent).toBeNull();
    // getHTML() must not run for the common echo path (perf: avoids re-serializing
    // the whole document on every keystroke).
    expect(getCurrentContent).not.toHaveBeenCalled();
  });

  it('skips a STALE echo that lags several keystrokes behind the editor (debounced parent)', () => {
    const tracker = createContentSyncTracker('');
    tracker.recordEmitted('<p>Got it</p>');
    tracker.recordEmitted('<p>Got it. What</p>');
    tracker.recordEmitted('<p>Got it. What time</p>');

    // The debounced draft state lands with an older value while the editor
    // already holds the newer text — writing it back would delete " What time".
    const { externalContent } = reconcile(tracker, '<p>Got it</p>', '<p>Got it. What time</p>');

    expect(externalContent).toBeNull();
  });

  it('ignores an unchanged prop on a later reconcile (compositionend with a stale prop)', () => {
    const tracker = createContentSyncTracker('<p>Hi</p>');
    tracker.recordEmitted('<p>Hi there</p>');

    // compositionend re-runs the reconcile while `content` still holds the value
    // from before the user typed; that is not an external change.
    const { externalContent, getCurrentContent } = reconcile(tracker, '<p>Hi</p>', '<p>Hi there</p>');

    expect(externalContent).toBeNull();
    expect(getCurrentContent).not.toHaveBeenCalled();
  });

  it('never reconciles mid-composition, then applies the deferred change afterwards', () => {
    const tracker = createContentSyncTracker('<p>abc</p>');

    expect(reconcile(tracker, '<p>external</p>', '<p>abc</p>', true).externalContent).toBeNull();
    expect(reconcile(tracker, '<p>external</p>', '<p>abc</p>').externalContent).toBe('<p>external</p>');
  });

  it('syncs a genuinely external content change (draft restore / picked reply option)', () => {
    const tracker = createContentSyncTracker('');
    tracker.recordEmitted('<p>old editor value</p>');

    const { externalContent } = reconcile(tracker, '<p>Restored draft</p>', '<p>old editor value</p>');

    expect(externalContent).toBe('<p>Restored draft</p>');
  });

  it('applies text the editor emitted earlier once an external change has replaced it (back to the Custom tab)', () => {
    const tracker = createContentSyncTracker('');
    tracker.recordEmitted('<p>my custom reply</p>');
    expect(reconcile(tracker, '<p>Suggested option</p>', '<p>my custom reply</p>').externalContent).toBe(
      '<p>Suggested option</p>'
    );

    const { externalContent } = reconcile(tracker, '<p>my custom reply</p>', '<p>Suggested option</p>');

    expect(externalContent).toBe('<p>my custom reply</p>');
  });

  it('treats both-empty as a no-op (empty paragraph vs empty string)', () => {
    const tracker = createContentSyncTracker('<p>stale</p>');

    expect(reconcile(tracker, '', TAG_EMPTY_PARAGRAPH).externalContent).toBeNull();
  });

  it('syncs external content into an empty editor', () => {
    const tracker = createContentSyncTracker('');

    expect(reconcile(tracker, '<p>New reply</p>', TAG_EMPTY_PARAGRAPH).externalContent).toBe('<p>New reply</p>');
  });

  it('bounds the remembered emissions when the parent never echoes them', () => {
    const tracker = createContentSyncTracker('');
    tracker.recordEmitted('<p>first</p>');
    for (let index = 0; index < MAX_PENDING_EDITOR_ECHOES; index++) {
      tracker.recordEmitted(`<p>${index}</p>`);
    }

    expect(reconcile(tracker, '<p>first</p>', '<p>latest</p>').externalContent).toBe('<p>first</p>');
  });
});
