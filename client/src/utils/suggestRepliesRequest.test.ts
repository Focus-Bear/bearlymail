import { Email } from 'types/email';

import { LAST_INBOX_MODE_STORAGE_KEY, MODE_FOLLOW_UP } from 'constants/strings';

import { buildSuggestRepliesRequest, readLastInboxMode } from './suggestRepliesRequest';

const userSentEmail = {
  id: 'email-1',
  threadId: 'gmail-thread',
  emailThreadId: 'thread-uuid',
  from: 'jeremy@focusbear.io',
  fromName: 'Jeremy',
  to: 'Wellbeing@mq.edu.au',
  subject: 'Free assistive technology software',
  body: 'Just following up on my email below.',
  isRead: true,
  isSnoozed: false,
  receivedAt: '2026-10-14T06:00:00Z',
} as Email;

describe('buildSuggestRepliesRequest', () => {
  it('sends the thread, email id, recipients and inbox mode so the server can detect follow-ups', () => {
    expect(buildSuggestRepliesRequest(userSentEmail, { inboxMode: MODE_FOLLOW_UP })).toEqual({
      originalEmail: {
        from: 'jeremy@focusbear.io',
        fromName: 'Jeremy',
        to: 'Wellbeing@mq.edu.au',
        subject: 'Free assistive technology software',
        body: 'Just following up on my email below.',
      },
      emailId: 'email-1',
      emailThreadId: 'thread-uuid',
      inboxMode: MODE_FOLLOW_UP,
    });
  });

  it('includes custom instructions and omits unknown thread and mode', () => {
    const request = buildSuggestRepliesRequest(
      { ...userSentEmail, emailThreadId: undefined },
      { userInstructions: 'offer a call' }
    );

    expect(request.userInstructions).toBe('offer a call');
    expect(request).not.toHaveProperty('emailThreadId');
    expect(request).not.toHaveProperty('inboxMode');
  });
});

describe('readLastInboxMode', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('returns the inbox mode the user last viewed', () => {
    sessionStorage.setItem(LAST_INBOX_MODE_STORAGE_KEY, MODE_FOLLOW_UP);
    expect(readLastInboxMode()).toBe(MODE_FOLLOW_UP);
  });

  it('returns undefined when no mode is stored', () => {
    expect(readLastInboxMode()).toBeUndefined();
  });
});
