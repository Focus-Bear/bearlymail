import { Email } from 'types/email';

import {
  LAST_INBOX_MODE_STORAGE_KEY,
  MODE_ACTION,
  MODE_FOLLOW_UP,
  MODE_TRIAGE,
  NAVIGATION_SOURCE_SEARCH,
} from 'constants/strings';

import { buildSuggestRepliesRequest, resolveReplyInboxMode } from './suggestRepliesRequest';

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

describe('resolveReplyInboxMode', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('uses the mode in the URL when replying from the inbox split view', () => {
    expect(resolveReplyInboxMode(`/inbox/${MODE_FOLLOW_UP}/thread-1`, null)).toBe(MODE_FOLLOW_UP);
    expect(resolveReplyInboxMode(`/focused-inbox/${MODE_ACTION}/thread-1`, null)).toBe(MODE_ACTION);
  });

  it('uses the mode the inbox list passed when opening the email full-page', () => {
    expect(resolveReplyInboxMode('/email/email-1', { fromMode: MODE_FOLLOW_UP })).toBe(MODE_FOLLOW_UP);
  });

  it('prefers the URL mode over navigation state', () => {
    expect(resolveReplyInboxMode(`/inbox/${MODE_TRIAGE}/thread-1`, { fromMode: MODE_FOLLOW_UP })).toBe(MODE_TRIAGE);
  });

  it('ignores a stale last-visited Follow-Up mode when the email was opened from search', () => {
    sessionStorage.setItem(LAST_INBOX_MODE_STORAGE_KEY, MODE_FOLLOW_UP);

    expect(resolveReplyInboxMode('/email/email-1', { from: NAVIGATION_SOURCE_SEARCH })).toBeUndefined();
  });

  it('is unknown for an email opened without inbox context (contact page, direct link)', () => {
    sessionStorage.setItem(LAST_INBOX_MODE_STORAGE_KEY, MODE_FOLLOW_UP);

    expect(resolveReplyInboxMode('/email/email-1', null)).toBeUndefined();
  });
});
