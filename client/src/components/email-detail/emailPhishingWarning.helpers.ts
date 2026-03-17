/**
 * Pure helper functions extracted from EmailPhishingWarning.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

export type PhishingConfidence = 'low' | 'medium' | 'high';

const PHISHING_CONFIDENCE_MEDIUM = 'medium' as const;
const PHISHING_CONFIDENCE_HIGH = 'high' as const;

export function shouldShowPhishingAlert(confidence: PhishingConfidence | null | undefined): boolean {
  return confidence === PHISHING_CONFIDENCE_MEDIUM || confidence === PHISHING_CONFIDENCE_HIGH;
}
