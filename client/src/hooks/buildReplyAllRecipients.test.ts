import { Email } from 'types/email';

import { buildReplyAllRecipients, buildReplyToOwnEmailRecipient, IsCurrentUserFn } from './buildReplyAllRecipients';

const USER_EMAIL = 'me@example.com';
const SENDER = 'coko@2gether-international.org';

const isCurrentUser: IsCurrentUserFn = addr => addr.toLowerCase() === USER_EMAIL;

const makeEmail = (overrides: Partial<Email>): Pick<Email, 'from' | 'to' | 'cc' | 'replyTo'> => ({
  from: SENDER,
  to: USER_EMAIL,
  ...overrides,
});

describe('buildReplyAllRecipients — RFC 5322 groups', () => {
  it('drops "undisclosed-recipients:;" when replying to mail you were BCC\'d on', () => {
    const email = makeEmail({ to: 'undisclosed-recipients:;' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({ recipients: SENDER, cc: null });
  });

  it('drops an empty group whatever it is called', () => {
    const email = makeEmail({ to: 'Recipients list suppressed:;, other@example.com' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `${SENDER}, other@example.com`,
      cc: null,
    });
  });

  it('drops an empty group written without the closing semicolon', () => {
    const email = makeEmail({ to: 'Undisclosed recipients:' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({ recipients: SENDER, cc: null });
  });

  it('keeps the members of a named group, without the group name', () => {
    const email = makeEmail({ to: `Team: a@x.com, b@y.com, ${USER_EMAIL};` });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `${SENDER}, a@x.com, b@y.com`,
      cc: null,
    });
  });

  it('drops an empty group from Cc and hides Cc when nothing is left', () => {
    const email = makeEmail({ cc: 'undisclosed-recipients:;' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({ recipients: SENDER, cc: null });
  });

  it('drops tokens that are not an address', () => {
    const email = makeEmail({ to: 'not-an-address, other@example.com' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false).recipients).toBe(`${SENDER}, other@example.com`);
  });
});

describe('buildReplyAllRecipients — self and duplicates', () => {
  it('plain BCC reply-all goes to the sender only', () => {
    const email = makeEmail({ from: `Coko Eason <${SENDER}>`, to: SENDER });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `Coko Eason <${SENDER}>`,
      cc: null,
    });
  });

  it('excludes the current user from To and Cc, whatever the case or display name', () => {
    const email = makeEmail({ to: 'Me <ME@example.com>, other@example.com', cc: `Me <${USER_EMAIL}>, cc@example.com` });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `${SENDER}, other@example.com`,
      cc: 'cc@example.com',
    });
  });

  it('de-duplicates by address across To and Cc', () => {
    const email = makeEmail({
      to: `Coko <${SENDER.toUpperCase()}>, other@example.com`,
      cc: 'Other Person <other@example.com>, cc@example.com',
    });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `${SENDER}, other@example.com`,
      cc: 'cc@example.com',
    });
  });

  it('uses Reply-To instead of From when present', () => {
    const email = makeEmail({ replyTo: 'list@example.com' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false).recipients).toBe('list@example.com');
  });

  it('reply-all on your own sent mail goes to its To recipients, not to you', () => {
    const email = makeEmail({ from: USER_EMAIL, to: 'a@x.com, undisclosed-recipients:;', cc: 'c@x.com' });
    expect(buildReplyAllRecipients(email, isCurrentUser, true)).toEqual({ recipients: 'a@x.com', cc: 'c@x.com' });
  });

  it('keeps quoted display names that contain a comma intact', () => {
    const email = makeEmail({ to: `"Doe, Jane" <jane@x.com>, ${USER_EMAIL}`, cc: '"Smith, Bob" <bob@y.com>' });
    expect(buildReplyAllRecipients(email, isCurrentUser, false)).toEqual({
      recipients: `${SENDER}, "Doe, Jane" <jane@x.com>`,
      cc: '"Smith, Bob" <bob@y.com>',
    });
  });
});

describe('buildReplyToOwnEmailRecipient', () => {
  it('addresses the first other person the user wrote to', () => {
    expect(
      buildReplyToOwnEmailRecipient({ from: USER_EMAIL, to: `${USER_EMAIL}, Ann <ann@x.com>` }, isCurrentUser)
    ).toBe('Ann <ann@x.com>');
  });

  it('falls back to the sender when the mail went out only by BCC', () => {
    expect(buildReplyToOwnEmailRecipient({ from: USER_EMAIL, to: 'undisclosed-recipients:;' }, isCurrentUser)).toBe(
      USER_EMAIL
    );
  });
});
