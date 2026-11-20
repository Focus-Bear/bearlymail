/**
 * A high-confidence phishing verdict must pull the thread out of whatever category the
 * categoriser chose: a "SendGrid" impersonation was filed under Security & Compliance,
 * where it read as a legitimate account alert (report 2026-11-20_16-24-28).
 */
import { Email } from 'types/email';

import { getEmailGroupKey } from 'components/inbox/CategoryAccordion';
import {
  CATEGORY_DANGEROUS_PHISHING,
  CATEGORY_OTHER,
  PHISHING_CONFIDENCE_HIGH,
  PHISHING_CONFIDENCE_MEDIUM,
} from 'constants/strings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const SECURITY_CATEGORY_ID = 'security-and-compliance-uuid';

function makeEmail(overrides: Partial<Email>): Email {
  return {
    id: 'email',
    threadId: 'thread',
    from: 'SendGrid <noreply@foundryhealth.com>',
    subject: 'Following up on your recent support chat',
    isRead: false,
    isSnoozed: false,
    receivedAt: '2026-11-20T04:10:00Z',
    category: 'Security & Compliance',
    category_id: SECURITY_CATEGORY_ID,
    ...overrides,
  } as Email;
}

describe('getEmailGroupKey — phishing verdicts', () => {
  it('moves a high-confidence phishing email out of its server-assigned category', () => {
    expect(getEmailGroupKey(makeEmail({ phishingConfidence: PHISHING_CONFIDENCE_HIGH }))).toBe(
      CATEGORY_DANGEROUS_PHISHING
    );
  });

  it('keeps a medium-confidence verdict in its server-assigned category', () => {
    expect(getEmailGroupKey(makeEmail({ phishingConfidence: PHISHING_CONFIDENCE_MEDIUM }))).toBe(SECURITY_CATEGORY_ID);
  });

  it('routes a medium-confidence verdict with no real category to the phishing bucket', () => {
    expect(
      getEmailGroupKey(
        makeEmail({ phishingConfidence: PHISHING_CONFIDENCE_MEDIUM, category: CATEGORY_OTHER, category_id: null })
      )
    ).toBe(CATEGORY_DANGEROUS_PHISHING);
  });

  it('leaves an email without a phishing verdict in its category', () => {
    expect(getEmailGroupKey(makeEmail({ phishingConfidence: null }))).toBe(SECURITY_CATEGORY_ID);
  });
});
