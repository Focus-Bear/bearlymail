/**
 * Pure helper functions extracted from ToneCheckResult.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const TIMING_KEYWORDS = [
  'late',
  'night',
  'weekend',
  'early',
  'morning',
  'timing',
  'hour',
  'after hours',
  'business hours',
  'off hours',
];

/** Returns true if there is an inappropriate timing suggestion (from the dedicated field or legacy keyword scan). */
export function hasSendTimingSuggestion(suggestions: string[], inappropriateTiming?: string | null): boolean {
  if (inappropriateTiming) {
    return true;
  }
  // Fallback: legacy keyword scan for old API responses that may still embed timing in suggestions
  return suggestions.some(suggestion => TIMING_KEYWORDS.some(kw => suggestion.toLowerCase().includes(kw)));
}
