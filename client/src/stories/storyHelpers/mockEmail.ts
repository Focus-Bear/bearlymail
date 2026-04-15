import { Email } from 'types/email';

/** One hour in milliseconds */
const ONE_HOUR_MS = 3_600_000;
/** Two hours in milliseconds */
const TWO_HOURS_MS = 7_200_000;
/** Three hours in milliseconds */
const THREE_HOURS_MS = 10_800_000;
/** Default urgency score for mock emails */
const DEFAULT_URGENCY_SCORE = 30;

let _counter = 0;
function nextId(): string {
  return `mock-email-${++_counter}`;
}

/**
 * Factory for a minimal valid Email fixture.
 * Pass overrides to customise individual fields.
 */
// eslint-disable-next-line complexity -- pre-existing: test fixture factory with many optional fields
export function makeMockEmail(overrides: Partial<Email> = {}): Email {
  const id = overrides.id ?? nextId();
  const receivedAt = overrides.receivedAt ?? new Date(Date.now() - ONE_HOUR_MS).toISOString();
  return {
    id,
    threadId: overrides.threadId ?? `thread-${id}`,
    from: overrides.from ?? 'alice@example.com',
    fromName: overrides.fromName ?? 'Alice Nguyen',
    to: overrides.to ?? 'me@bearlymail.com',
    subject: overrides.subject ?? 'Quarterly review notes',
    body: overrides.body ?? 'Hi team,\n\nHere are the notes from our quarterly review call.\n\nBest,\nAlice',
    htmlBody: overrides.htmlBody,
    isRead: overrides.isRead ?? true,
    isSnoozed: overrides.isSnoozed ?? false,
    receivedAt,
    category: overrides.category ?? 'Work',
    category_id: overrides.category_id ?? 'cat-work-001',
    starCount: overrides.starCount ?? 0,
    isArchived: overrides.isArchived ?? false,
    labels: overrides.labels ?? [],
    correspondentEmail: overrides.correspondentEmail ?? 'alice@example.com',
    correspondentName: overrides.correspondentName ?? 'Alice Nguyen',
    summary:
      overrides.summary ??
      'Alice shares quarterly review notes and requests sign-off from the finance team by Thursday.',
    actionItemsCount: overrides.actionItemsCount ?? 2,
    urgencyScore: overrides.urgencyScore ?? DEFAULT_URGENCY_SCORE,
    priorityScore: overrides.priorityScore ?? 2,
    ...overrides,
  };
}

/** A sample email from a known sender. */
export const MOCK_EMAIL_WORK = makeMockEmail({
  id: 'email-work-1',
  from: 'alice@example.com',
  fromName: 'Alice Nguyen',
  subject: 'Q1 Budget Review — sign-off needed by Thursday',
  body: 'Hi,\n\nPlease review and sign off by Thursday.\n\nThanks,\nAlice',
  category: 'Work',
  category_id: 'cat-work',
  starCount: 2,
  urgencyScore: 75,
  priorityScore: 3,
  actionItemsCount: 3,
});

/** A newsletter-style email (low priority). */
export const MOCK_EMAIL_NEWSLETTER = makeMockEmail({
  id: 'email-newsletter-1',
  from: 'digest@techcrunch.com',
  fromName: 'TechCrunch Daily',
  subject: 'Your daily briefing — AI roundup',
  body: 'Here is your daily AI roundup…',
  category: 'Newsletters',
  category_id: 'cat-newsletters',
  starCount: 0,
  urgencyScore: 5,
  priorityScore: 0,
  isRead: true,
  actionItemsCount: 0,
});

/** A customer support thread email. */
export const MOCK_EMAIL_SUPPORT = makeMockEmail({
  id: 'email-support-1',
  from: 'support@acme.com',
  fromName: 'Acme Support',
  subject: 'Re: Your ticket #8821 — billing issue',
  body: 'Thank you for contacting support. We are looking into your billing issue and will get back to you within 24 hours.',
  category: 'Customer Support',
  category_id: 'cat-support',
  starCount: 1,
  urgencyScore: 60,
  priorityScore: 2,
  actionItemsCount: 1,
});

/** A batch of work emails for list/accordion stories. */
export const MOCK_EMAILS_WORK: Email[] = [
  MOCK_EMAIL_WORK,
  makeMockEmail({
    id: 'email-work-2',
    from: 'bob@example.com',
    fromName: 'Bob Chen',
    subject: 'Sprint retro action items',
    body: "See attached action items from last week's retro.",
    category: 'Work',
    category_id: 'cat-work',
    receivedAt: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
  }),
  makeMockEmail({
    id: 'email-work-3',
    from: 'carol@example.com',
    fromName: 'Carol Smith',
    subject: 'Contract renewal — please review',
    body: 'Hi, please review the attached contract renewal before the Friday deadline.',
    category: 'Work',
    category_id: 'cat-work',
    receivedAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
    urgencyScore: 90,
    priorityScore: 3,
  }),
];

/** A full inbox mock spanning multiple categories. */
export const MOCK_INBOX_EMAILS: Email[] = [...MOCK_EMAILS_WORK, MOCK_EMAIL_NEWSLETTER, MOCK_EMAIL_SUPPORT];
