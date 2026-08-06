/**
 * Unit tests for calendarUtils.ts
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { Email } from 'types/email';

import { hasIcsAttachment, isCalendarInvitation } from './calendarUtils';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'test-email',
    threadId: 'thread-1',
    subject: '',
    from: 'sender@example.com',
    to: [],
    cc: [],
    bcc: [],
    body: '',
    htmlBody: '',
    snippet: '',
    date: new Date().toISOString(),
    category: null,
    category_id: null,
    protoCategoryName: null,
    isRead: false,
    isStarred: false,
    phishingConfidence: null,
    priorityScore: 50,
    ...overrides,
  } as Email;
}

describe('isCalendarInvitation', () => {
  it('returns false for a plain email with no calendar signals', () => {
    const email = makeEmail({ subject: 'Hello!', body: 'Just following up.' });
    expect(isCalendarInvitation(email)).toBe(false);
  });

  it('returns true when subject contains "invitation:"', () => {
    const email = makeEmail({ subject: 'Invitation: Team Sync @ 10am' });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when subject contains "meeting request" (case-insensitive)', () => {
    const email = makeEmail({ subject: 'Meeting Request: Budget Review' });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when subject contains "calendar invitation"', () => {
    const email = makeEmail({ subject: 'Calendar Invitation from Alice' });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when body contains BEGIN:VCALENDAR', () => {
    const email = makeEmail({ body: 'Content-Type: text/calendar\nBEGIN:VCALENDAR\nMETHOD:REQUEST' });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when body contains DTSTART and UID with @', () => {
    const email = makeEmail({
      body: 'DTSTART:20240101T100000Z\nUID:abc123@google.com\nDTEND:20240101T110000Z',
    });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when htmlBody contains .ics attachment pattern', () => {
    const email = makeEmail({
      htmlBody: 'Please see attached: attachment; filename="invite.ics" for the event details.',
    });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns false for a fundraising email (false-positive guard)', () => {
    const email = makeEmail({
      subject: 'Help us reach our goal!',
      body: 'We are raising funds for the community project. Please donate today.',
      htmlBody: '<p>Support our cause and make a difference.</p>',
    });
    expect(isCalendarInvitation(email)).toBe(false);
  });

  it('returns true when subject contains "you\'re invited to"', () => {
    const email = makeEmail({ subject: "You're invited to our annual celebration" });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('returns true when body contains METHOD:REQUEST', () => {
    const email = makeEmail({ body: 'Content here\nMETHOD:REQUEST\nSome footer' });
    expect(isCalendarInvitation(email)).toBe(true);
  });

  it('handles missing fields gracefully (null/undefined)', () => {
    const email = makeEmail({ subject: undefined, body: undefined, htmlBody: undefined });
    expect(isCalendarInvitation(email)).toBe(false);
  });
});

describe('hasIcsAttachment', () => {
  it('returns true when an attachment has the text/calendar MIME type', () => {
    const email = makeEmail({
      attachments: [{ attachmentId: 'a1', filename: 'meeting', mimeType: 'text/calendar', size: 512 }],
    });
    expect(hasIcsAttachment(email)).toBe(true);
  });

  it('returns true when an attachment filename ends in .ics', () => {
    const email = makeEmail({
      attachments: [{ attachmentId: 'a1', filename: 'invite.ics', mimeType: 'application/octet-stream', size: 512 }],
    });
    expect(hasIcsAttachment(email)).toBe(true);
  });

  it('matches .ics filenames case-insensitively', () => {
    const email = makeEmail({
      attachments: [{ attachmentId: 'a1', filename: 'INVITE.ICS', mimeType: 'application/octet-stream', size: 512 }],
    });
    expect(hasIcsAttachment(email)).toBe(true);
  });

  it('returns false when there are no attachments', () => {
    expect(hasIcsAttachment(makeEmail({ attachments: [] }))).toBe(false);
    expect(hasIcsAttachment(makeEmail({ attachments: undefined }))).toBe(false);
  });

  it('returns false for a non-ics attachment', () => {
    const email = makeEmail({
      attachments: [{ attachmentId: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', size: 512 }],
    });
    expect(hasIcsAttachment(email)).toBe(false);
  });
});
