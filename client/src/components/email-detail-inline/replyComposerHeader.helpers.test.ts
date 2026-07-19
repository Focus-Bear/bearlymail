/**
 * Unit tests for ReplyComposerHeader helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { mockPartial } from 'test/mockUtils';
import { Email } from 'types/email';

import { buildReplyAllRecipients } from 'hooks/buildReplyAllRecipients';

import { getHeaderTitle } from './replyComposerHeader.helpers';

const tFunc = (key: string): string => key;

describe('getHeaderTitle', () => {
  it('returns "emailDetail.reply" for reply mode', () => {
    expect(getHeaderTitle('reply', tFunc)).toBe('emailDetail.reply');
  });

  it('returns "emailDetail.replyAll" for replyAll mode', () => {
    expect(getHeaderTitle('replyAll', tFunc)).toBe('emailDetail.replyAll');
  });

  it('returns "emailDetail.forward" for forward mode', () => {
    expect(getHeaderTitle('forward', tFunc)).toBe('emailDetail.forward');
  });
});

describe('buildReplyAllRecipients — CC handling (issue #1173)', () => {
  const makeIsCurrentUser =
    (userEmail: string) =>
    (addr: string): boolean => {
      const extract = (addrStr: string): string => {
        const match = addrStr.match(/<([^>]+)>/);
        return match ? match[1].toLowerCase() : addrStr.toLowerCase();
      };
      return extract(addr) === userEmail.toLowerCase();
    };

  it('includes CC recipients when replying to an email with CC', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'me@example.com',
      cc: 'cc1@example.com, cc2@example.com',
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { recipients, cc } = buildReplyAllRecipients(email, isCurrentUser, false);
    expect(recipients).toContain('sender@example.com');
    expect(cc).toContain('cc1@example.com');
    expect(cc).toContain('cc2@example.com');
  });

  it('excludes the current user from CC in reply-all', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'me@example.com',
      cc: 'cc1@example.com, me@example.com',
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { cc } = buildReplyAllRecipients(email, isCurrentUser, false);
    expect(cc).toContain('cc1@example.com');
    expect(cc).not.toContain('me@example.com');
  });

  it('returns null cc when email has no CC field', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'me@example.com',
      cc: undefined,
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { cc } = buildReplyAllRecipients(email, isCurrentUser, false);
    expect(cc).toBeNull();
  });

  it('returns null cc when CC field is empty string', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'me@example.com',
      cc: '',
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { cc } = buildReplyAllRecipients(email, isCurrentUser, false);
    expect(cc).toBeNull();
  });

  it('handles CC with "Name <email>" format, stripping self', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'me@example.com',
      cc: 'Alice <alice@example.com>, Me <me@example.com>',
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { cc } = buildReplyAllRecipients(email, isCurrentUser, false);
    expect(cc).toContain('Alice <alice@example.com>');
    expect(cc).not.toContain('Me <me@example.com>');
  });

  it('keeps a quoted "Last, First" To recipient intact (regression: Invalid To header)', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'rohan@gmail.com, "Jeremy Nagel - Founder, Focus Bear" <jeremy@focusbear.io>',
      cc: undefined,
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { recipients } = buildReplyAllRecipients(email, isCurrentUser, false);
    // The comma inside the quoted display name must NOT shatter the recipient.
    expect(recipients).toContain('"Jeremy Nagel - Founder, Focus Bear" <jeremy@focusbear.io>');
    expect(recipients).not.toContain('"Jeremy Nagel - Founder<');
  });

  it('when current user is the sender (reply-all on sent email), includes To recipients', () => {
    const email = mockPartial<Email>({
      from: 'me@example.com',
      to: 'recipient@example.com, cc@example.com',
      cc: 'someone@example.com',
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { recipients, cc } = buildReplyAllRecipients(email, isCurrentUser, true);
    expect(recipients).toContain('recipient@example.com');
    expect(recipients).toContain('cc@example.com');
    expect(cc).toContain('someone@example.com');
  });

  it('deduplicates recipients in reply-all', () => {
    const email = mockPartial<Email>({
      from: 'sender@example.com',
      to: 'sender@example.com, other@example.com',
      cc: undefined,
    });
    const isCurrentUser = makeIsCurrentUser('me@example.com');
    const { recipients } = buildReplyAllRecipients(email, isCurrentUser, false);
    const parts = recipients.split(',').map((str: string) => str.trim());
    const uniqueParts = [...new Set(parts)];
    expect(parts.length).toBe(uniqueParts.length);
  });
});
