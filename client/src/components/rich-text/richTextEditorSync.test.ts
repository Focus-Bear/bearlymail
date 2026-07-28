import { decideContentSync } from 'components/rich-text/richTextEditorSync';
import { TAG_EMPTY_PARAGRAPH } from 'constants/strings';

describe('decideContentSync', () => {
  it('skips the echo of the editor\'s own output without serializing (no caret reset)', () => {
    const getCurrentContent = vi.fn(() => '<p>hello worlXd</p>');
    // Simulate editing the MIDDLE: the editor emitted this value, so the
    // controlled prop echoes it straight back on the next render.
    const decision = decideContentSync({
      incomingContent: '<p>hello worlXd</p>',
      lastEmitted: '<p>hello worlXd</p>',
      composing: false,
      getCurrentContent,
    });
    expect(decision.shouldSync).toBe(false);
    // getHTML() must not run for the common echo path (perf: avoids re-serializing
    // the whole document on every keystroke).
    expect(getCurrentContent).not.toHaveBeenCalled();
  });

  it('never reconciles mid-composition', () => {
    const getCurrentContent = vi.fn(() => '<p>abc</p>');
    const decision = decideContentSync({
      incomingContent: '<p>external</p>',
      lastEmitted: '<p>abc</p>',
      composing: true,
      getCurrentContent,
    });
    expect(decision.shouldSync).toBe(false);
    expect(getCurrentContent).not.toHaveBeenCalled();
  });

  it('syncs a genuinely external content change (draft restore / picked reply option)', () => {
    const decision = decideContentSync({
      incomingContent: '<p>Restored draft</p>',
      lastEmitted: '<p>old editor value</p>',
      composing: false,
      getCurrentContent: () => '<p>old editor value</p>',
    });
    expect(decision.shouldSync).toBe(true);
    expect(decision.value).toBe('<p>Restored draft</p>');
  });

  it('treats both-empty as a no-op (empty paragraph vs empty string)', () => {
    const decision = decideContentSync({
      incomingContent: '',
      lastEmitted: '<p>stale</p>',
      composing: false,
      getCurrentContent: () => TAG_EMPTY_PARAGRAPH,
    });
    expect(decision.shouldSync).toBe(false);
  });

  it('syncs external content into an empty editor', () => {
    const decision = decideContentSync({
      incomingContent: '<p>New reply</p>',
      lastEmitted: '',
      composing: false,
      getCurrentContent: () => TAG_EMPTY_PARAGRAPH,
    });
    expect(decision.shouldSync).toBe(true);
    expect(decision.value).toBe('<p>New reply</p>');
  });

  it('does not reset the caret when a stale echo differs from getHTML but matches lastEmitted', () => {
    // Mobile compositionend race: the editor already holds the final composed
    // text (lastEmitted) even if `content` lags a render behind. As long as the
    // incoming value matches what we emitted, we must not setContent.
    const getCurrentContent = vi.fn(() => '<p>final</p>');
    const decision = decideContentSync({
      incomingContent: '<p>final</p>',
      lastEmitted: '<p>final</p>',
      composing: false,
      getCurrentContent,
    });
    expect(decision.shouldSync).toBe(false);
    expect(getCurrentContent).not.toHaveBeenCalled();
  });
});
