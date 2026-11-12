import { replaceEditedRecipient } from './recipientChipEditing';

const TAGS = ['a@x.com', 'Bee <b@y.com>', 'c@z.com'];

describe('replaceEditedRecipient', () => {
  it('replaces the edited recipient in place', () => {
    expect(replaceEditedRecipient(TAGS, 1, 'Bea <bea@y.com>')).toEqual(['a@x.com', 'Bea <bea@y.com>', 'c@z.com']);
  });

  it('trims whitespace around the edit', () => {
    expect(replaceEditedRecipient(TAGS, 0, '  ann@x.com  ')).toEqual(['ann@x.com', 'Bee <b@y.com>', 'c@z.com']);
  });

  it('removes the recipient when the text is cleared', () => {
    expect(replaceEditedRecipient(TAGS, 1, '   ')).toEqual(['a@x.com', 'c@z.com']);
  });

  it('splits a comma-separated edit into several recipients at the same position', () => {
    expect(replaceEditedRecipient(TAGS, 0, 'a@x.com, d@w.com')).toEqual([
      'a@x.com',
      'd@w.com',
      'Bee <b@y.com>',
      'c@z.com',
    ]);
  });

  it('keeps a quoted display name containing a comma as one recipient', () => {
    expect(replaceEditedRecipient(['a@x.com'], 0, '"Doe, Jane" <jane@x.com>')).toEqual(['"Doe, Jane" <jane@x.com>']);
  });

  it('does not add an address that is already in the list, ignoring case and display name', () => {
    expect(replaceEditedRecipient(TAGS, 2, 'A@X.com')).toEqual(['a@x.com', 'Bee <b@y.com>']);
    expect(replaceEditedRecipient(TAGS, 2, 'Bea <B@y.com>')).toEqual(['a@x.com', 'Bee <b@y.com>']);
  });

  it('keeps one copy when the edit itself repeats an address', () => {
    expect(replaceEditedRecipient(TAGS, 0, 'd@w.com, D@w.com')).toEqual(['d@w.com', 'Bee <b@y.com>', 'c@z.com']);
  });

  it('rejects an edit that is not an address', () => {
    expect(replaceEditedRecipient(TAGS, 0, 'not-an-address')).toBeNull();
  });

  it('rejects the whole edit when any part is not an address', () => {
    expect(replaceEditedRecipient(TAGS, 0, 'a@x.com, oops')).toBeNull();
  });
});
