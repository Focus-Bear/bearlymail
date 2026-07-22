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

/** Minimal shape needed to decide whether a tone-check result should pause the send. */
interface ToneCheckBlockingResult {
  isOk: boolean;
  /** Advisory calendar-conflict warning; soft-blocks the send until acknowledged. */
  calendarWarning?: string | null;
}

/**
 * True when the pre-send checks should pause the send (soft block): either the
 * tone check failed, or a calendar date/meeting mismatch was flagged. Both are
 * advisory — the user can still hold-to-send-anyway.
 */
export function isToneCheckBlocking(result: ToneCheckBlockingResult | null | undefined): boolean {
  return !!result && (!result.isOk || !!result.calendarWarning);
}

/** Returns true if there is an inappropriate timing suggestion (from the dedicated field or legacy keyword scan). */
export function hasSendTimingSuggestion(suggestions: string[], inappropriateTiming?: string | null): boolean {
  if (inappropriateTiming) {
    return true;
  }
  // Fallback: legacy keyword scan for old API responses that may still embed timing in suggestions
  return suggestions.some(suggestion => TIMING_KEYWORDS.some(kw => suggestion.toLowerCase().includes(kw)));
}
