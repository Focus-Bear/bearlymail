import type { Email } from 'types/email';

import {
  applySummaryPhishingSignal,
  formatSenderAuthResults,
  getPhishingVerdict,
  PHISHING_VERDICTS,
  splitPhishingReasons,
} from './phishingVerdict.helpers';

describe('getPhishingVerdict', () => {
  it.each([
    ['high', PHISHING_VERDICTS.PHISHING],
    ['medium', PHISHING_VERDICTS.PHISHING],
    ['low', PHISHING_VERDICTS.SUSPICIOUS],
  ] as const)('reads %s confidence as %s', (phishingConfidence, verdict) => {
    expect(getPhishingVerdict({ phishingConfidence, summarySource: 'llm' })).toBe(verdict);
  });

  it('is safe when the AI summary ran and flagged nothing', () => {
    expect(getPhishingVerdict({ phishingConfidence: null, summarySource: 'llm' })).toBe(PHISHING_VERDICTS.SAFE);
  });

  it.each([
    ['a deterministic placeholder summary', 'deterministic' as const],
    ['only a preview derived from the body', null],
  ])('is not checked yet with %s', (_label, summarySource) => {
    expect(getPhishingVerdict({ phishingConfidence: null, summarySource })).toBe(PHISHING_VERDICTS.NOT_CHECKED);
  });
});

describe('splitPhishingReasons', () => {
  it('lists each piece of rule-based evidence on its own', () => {
    expect(
      splitPhishingReasons(
        'The sender name claims to be Twilio SendGrid but the email comes from botmd.io, which is not a Twilio SendGrid domain; it pressures you to act to restore your account.'
      )
    ).toEqual([
      'The sender name claims to be Twilio SendGrid but the email comes from botmd.io, which is not a Twilio SendGrid domain',
      'It pressures you to act to restore your account',
    ]);
  });

  it('keeps a prose reason as one item', () => {
    expect(splitPhishingReasons('Asks for your password via a lookalike page.')).toEqual([
      'Asks for your password via a lookalike page',
    ]);
  });

  it.each([null, undefined, '  '])('is empty for %p', reason => {
    expect(splitPhishingReasons(reason)).toEqual([]);
  });
});

describe('formatSenderAuthResults', () => {
  it('lists SPF, DKIM and DMARC in order', () => {
    expect(formatSenderAuthResults({ dmarc: 'fail', spf: 'pass', dkim: 'pass' })).toBe(
      'SPF pass · DKIM pass · DMARC fail'
    );
  });

  it.each([null, undefined, {}])('is null without results (%p)', results => {
    expect(formatSenderAuthResults(results)).toBeNull();
  });
});

describe('applySummaryPhishingSignal', () => {
  const email = { id: 'e1', phishingConfidence: null, summarySource: null } as unknown as Email;

  it('stores the verdict of a regenerated summary', () => {
    expect(applySummaryPhishingSignal(email, { confidence: 'high', reason: 'Brand mismatch.' })).toEqual(
      expect.objectContaining({ phishingConfidence: 'high', phishingReason: 'Brand mismatch.', summarySource: 'llm' })
    );
  });

  it('clears the verdict when the regenerated summary found none', () => {
    const flagged = { ...email, phishingConfidence: 'high', phishingReason: 'Old reason' } as Email;
    expect(applySummaryPhishingSignal(flagged, null)).toEqual(
      expect.objectContaining({ phishingConfidence: null, phishingReason: null })
    );
  });

  it('leaves the email alone when the response has no verdict field', () => {
    expect(applySummaryPhishingSignal(email, undefined)).toBe(email);
  });
});
