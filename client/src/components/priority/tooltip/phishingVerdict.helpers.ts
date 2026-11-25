import type { Email, SenderAuthResults } from 'types/email';

import { PHISHING_CONFIDENCE_HIGH, PHISHING_CONFIDENCE_MEDIUM } from 'constants/strings';

/**
 * What the priority popover says about phishing. Medium and high confidence
 * are what raise the phishing banner, so both read as "phishing" here; low is
 * a hint the model noted without warning the user.
 */
export const PHISHING_VERDICTS = {
  PHISHING: 'phishing',
  SUSPICIOUS: 'suspicious',
  SAFE: 'safe',
  NOT_CHECKED: 'notChecked',
} as const;

export type PhishingVerdict = (typeof PHISHING_VERDICTS)[keyof typeof PHISHING_VERDICTS];

export type PhishingVerdictEmail = Pick<
  Email,
  'phishingConfidence' | 'phishingReason' | 'senderAuthResults' | 'summarySource'
>;

const PHISHING_CONFIDENCE_LOW = 'low' as const;
// The phishing check runs with the AI summary; a deterministic or derived
// preview summary means it has not run for this email yet.
const ANALYSED_SUMMARY_SOURCE = 'llm' as const;
const AUTH_METHODS = ['spf', 'dkim', 'dmarc'] as const;
const AUTH_RESULT_SEPARATOR = ' · ';
const REASON_SEPARATOR = /;\s+/;
const TRAILING_PERIOD = /\.$/;

export function getPhishingVerdict(email: PhishingVerdictEmail): PhishingVerdict {
  const { phishingConfidence } = email;
  if (phishingConfidence === PHISHING_CONFIDENCE_HIGH || phishingConfidence === PHISHING_CONFIDENCE_MEDIUM) {
    return PHISHING_VERDICTS.PHISHING;
  }
  if (phishingConfidence === PHISHING_CONFIDENCE_LOW) {
    return PHISHING_VERDICTS.SUSPICIOUS;
  }
  return email.summarySource === ANALYSED_SUMMARY_SOURCE ? PHISHING_VERDICTS.SAFE : PHISHING_VERDICTS.NOT_CHECKED;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The stored reason as a list. Rule-based verdicts join their evidence with
 * "; " ("The sender name claims to be … ; it pressures you to …."), so each
 * piece becomes its own line; a model's prose reason stays one item.
 */
export function splitPhishingReasons(reason: string | null | undefined): string[] {
  if (!reason?.trim()) return [];
  return reason
    .split(REASON_SEPARATOR)
    .map(part => part.trim().replace(TRAILING_PERIOD, ''))
    .filter(Boolean)
    .map(capitalise);
}

/** "SPF pass · DKIM pass · DMARC fail", or null when nothing was reported. */
export function formatSenderAuthResults(results: SenderAuthResults | null | undefined): string | null {
  if (!results) return null;
  const parts = AUTH_METHODS.filter(method => results[method]).map(
    method => `${method.toUpperCase()} ${results[method]}`
  );
  return parts.length > 0 ? parts.join(AUTH_RESULT_SEPARATOR) : null;
}

/** The verdict a summary request returns alongside the summary it generated. */
export interface SummaryPhishingSignal {
  confidence: NonNullable<Email['phishingConfidence']>;
  reason: string;
}

/**
 * The email with the verdict of a summary it just regenerated, which the
 * server also stores, so the badge popover and banner update without a reload.
 * `undefined` means the response carried no verdict field at all.
 */
export function applySummaryPhishingSignal(
  email: Email | null,
  signal: SummaryPhishingSignal | null | undefined
): Email | null {
  if (!email || signal === undefined) return email;
  return {
    ...email,
    phishingConfidence: signal?.confidence ?? null,
    phishingReason: signal?.reason ?? null,
    summarySource: ANALYSED_SUMMARY_SOURCE,
  };
}
