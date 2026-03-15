import { Email } from 'types/email';

/**
 * Detect if an email is a calendar invitation
 * Uses strict criteria to avoid false positives
 */
export function isCalendarInvitation(email: Email): boolean {
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase();
  const htmlBody = (email.htmlBody || '').toLowerCase();
  const combinedText = `${subject} ${body} ${htmlBody}`;

  // Check subject for specific invitation keywords (more strict)
  const invitationKeywords = [
    'invitation:', // Most common format
    'invite:', // Alternative format
    'meeting invitation',
    'event invitation',
    'calendar invitation',
    "you're invited to",
    'you are invited to',
    'meeting request',
    'event request',
  ];

  const hasInvitationKeyword = invitationKeywords.some(keyword => subject.includes(keyword));

  // Check for iCal content patterns (most reliable indicator)
  const hasICalPattern =
    combinedText.includes('begin:vcalendar') ||
    combinedText.includes('method:request') ||
    combinedText.includes('content-type:text/calendar') ||
    combinedText.includes('content-type: text/calendar') ||
    (combinedText.includes('attachment; filename="') && combinedText.includes('.ics'));

  // Check for iCal-specific headers (strict patterns)
  const hasICalHeaders =
    combinedText.includes('dtstart:') ||
    combinedText.includes('dtend:') ||
    combinedText.includes('organizer:mailto:') ||
    combinedText.includes('attendee:mailto:') ||
    (combinedText.includes('uid:') && combinedText.includes('@'));

  // Only return true if we have strong indicators from body/subject.
  // ICS attachments are detected separately (via email.attachments) and handled by
  // IcsInviteCard — including them here would cause IcsInviteCard to never render
  // because it is gated by !isInvitation.
  return hasInvitationKeyword || hasICalPattern || hasICalHeaders;
}
