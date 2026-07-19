import { Email } from 'types/email';

import { buildReplyAddresses, splitAddressList } from './useEmailDetailReplies';

const USER_EMAIL = 'me@example.com';

function makeEmail(overrides: Partial<Email>): Email {
  return {
    from: 'sender@example.com',
    to: USER_EMAIL,
    ...overrides,
  } as Email;
}

describe('buildReplyAddresses', () => {
  it('reply uses the sender (replyTo || from)', () => {
    const email = makeEmail({ from: 'Sender <sender@example.com>' });
    expect(buildReplyAddresses('reply', email, USER_EMAIL)).toEqual({
      recipients: 'Sender <sender@example.com>',
      cc: null,
      showCc: false,
    });
  });

  it('reply-all does NOT copy "undisclosed-recipients:;" from the To header', () => {
    const email = makeEmail({
      from: 'committees@aadpa.com.au',
      to: 'undisclosed-recipients:;',
    });
    expect(buildReplyAddresses('replyAll', email, USER_EMAIL)).toEqual({
      recipients: 'committees@aadpa.com.au',
      cc: null,
      showCc: false,
    });
  });

  it('reply-all keeps routable To recipients and drops unroutable tokens', () => {
    const email = makeEmail({
      from: 'sender@example.com',
      to: `undisclosed-recipients:;, other@example.com, ${USER_EMAIL}`,
    });
    expect(buildReplyAddresses('replyAll', email, USER_EMAIL)).toEqual({
      recipients: 'sender@example.com, other@example.com',
      cc: null,
      showCc: false,
    });
  });

  it('reply-all drops unroutable tokens from Cc', () => {
    const email = makeEmail({
      from: 'sender@example.com',
      cc: 'undisclosed-recipients:;, cc-person@example.com',
    });
    expect(buildReplyAddresses('replyAll', email, USER_EMAIL)).toEqual({
      recipients: 'sender@example.com',
      cc: 'cc-person@example.com',
      showCc: true,
    });
  });

  it('reply-all hides Cc entirely when it only contained unroutable tokens', () => {
    const email = makeEmail({
      from: 'sender@example.com',
      cc: 'undisclosed-recipients:;',
    });
    expect(buildReplyAddresses('replyAll', email, USER_EMAIL)).toEqual({
      recipients: 'sender@example.com',
      cc: null,
      showCc: false,
    });
  });

  it('reply to own sent email falls back to sender when To has no routable address', () => {
    const email = makeEmail({
      from: USER_EMAIL,
      replyTo: undefined,
      to: 'undisclosed-recipients:;',
    });
    expect(buildReplyAddresses('reply', email, USER_EMAIL)).toEqual({
      recipients: USER_EMAIL,
      cc: null,
      showCc: false,
    });
  });

  it('forward starts with empty recipients', () => {
    const email = makeEmail({});
    expect(buildReplyAddresses('forward', email, USER_EMAIL)).toEqual({
      recipients: '',
      cc: null,
      showCc: false,
    });
  });

  it('reply-all preserves quoted display names containing a comma', () => {
    const email = makeEmail({
      from: 'sender@example.com',
      to: `"Doe, Jane" <jane@x.com>, ${USER_EMAIL}`,
      cc: '"Smith, Bob" <bob@y.com>',
    });
    expect(buildReplyAddresses('replyAll', email, USER_EMAIL)).toEqual({
      recipients: 'sender@example.com, "Doe, Jane" <jane@x.com>',
      cc: '"Smith, Bob" <bob@y.com>',
      showCc: true,
    });
  });
});

describe('splitAddressList', () => {
  it('splits a plain comma-separated list', () => {
    expect(splitAddressList('a@x.com, Bob <bob@y.com>')).toEqual([
      'a@x.com',
      'Bob <bob@y.com>',
    ]);
  });

  it('does not split on a comma inside a quoted display name', () => {
    expect(
      splitAddressList('"Doe, Jane" <jane@x.com>, other@y.com')
    ).toEqual(['"Doe, Jane" <jane@x.com>', 'other@y.com']);
  });

  it('drops empty segments from trailing/double commas', () => {
    expect(splitAddressList('a@x.com,, b@y.com,')).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
  });
});
