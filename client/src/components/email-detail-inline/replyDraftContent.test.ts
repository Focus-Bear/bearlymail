import { hasUnsentReplyChanges } from './replyDraftContent';

describe('hasUnsentReplyChanges', () => {
  it('is false for a new reply with an empty body', () => {
    expect(hasUnsentReplyChanges({ draft: '', initialDraft: '', attachedFileCount: 0 })).toBe(false);
    expect(hasUnsentReplyChanges({ draft: null, initialDraft: null, attachedFileCount: 0 })).toBe(false);
  });

  it('is false when the editor holds only empty markup and whitespace', () => {
    expect(hasUnsentReplyChanges({ draft: '<p><br></p><p>&nbsp; </p>', initialDraft: '', attachedFileCount: 0 })).toBe(
      false
    );
  });

  it('is true once the user has typed text', () => {
    expect(
      hasUnsentReplyChanges({ draft: '<p>Great thanks for the intro.</p>', initialDraft: '', attachedFileCount: 0 })
    ).toBe(true);
  });

  it('is true for a body that only holds a pasted image', () => {
    expect(hasUnsentReplyChanges({ draft: '<p><img src="cid:abc"></p>', initialDraft: '', attachedFileCount: 0 })).toBe(
      true
    );
  });

  it('is true when files are attached, even with an empty body', () => {
    expect(hasUnsentReplyChanges({ draft: '', initialDraft: '', attachedFileCount: 1 })).toBe(true);
  });

  it('is false for a restored draft the user has not changed', () => {
    const saved = '<p>Saved earlier</p>';
    expect(hasUnsentReplyChanges({ draft: saved, initialDraft: saved, attachedFileCount: 0 })).toBe(false);
  });

  it('is true once a restored draft is edited', () => {
    expect(
      hasUnsentReplyChanges({
        draft: '<p>Saved earlier, plus more</p>',
        initialDraft: '<p>Saved earlier</p>',
        attachedFileCount: 0,
      })
    ).toBe(true);
  });
});
