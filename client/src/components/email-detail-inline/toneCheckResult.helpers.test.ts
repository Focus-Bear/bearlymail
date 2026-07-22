/**
 * Unit tests for ToneCheckResult helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { hasSendTimingSuggestion, isToneCheckBlocking } from './toneCheckResult.helpers';

describe('hasSendTimingSuggestion', () => {
  it('returns false for empty suggestions and no inappropriateTiming', () => {
    expect(hasSendTimingSuggestion([], null)).toBe(false);
  });

  it('returns false for non-timing suggestions and no inappropriateTiming', () => {
    expect(hasSendTimingSuggestion(['Be more concise', 'Avoid jargon'], null)).toBe(false);
  });

  it('returns true when inappropriateTiming is set (non-empty string)', () => {
    expect(hasSendTimingSuggestion([], 'Sending late at night is not recommended')).toBe(true);
  });

  it('returns true when a suggestion contains a timing keyword', () => {
    expect(hasSendTimingSuggestion(['This is being sent late at night'])).toBe(true);
  });

  it('returns true for "weekend" keyword in suggestion', () => {
    expect(hasSendTimingSuggestion(['Consider not sending on the weekend'])).toBe(true);
  });

  it('returns true for "business hours" keyword in suggestion', () => {
    expect(hasSendTimingSuggestion(['Send during business hours instead'])).toBe(true);
  });

  it('is case-insensitive for keyword matching', () => {
    expect(hasSendTimingSuggestion(['Send LATE at night'])).toBe(true);
  });

  it('returns false for undefined inappropriateTiming', () => {
    expect(hasSendTimingSuggestion(['No issues here'], undefined)).toBe(false);
  });
});

describe('isToneCheckBlocking', () => {
  it('returns false when the result is null or undefined', () => {
    expect(isToneCheckBlocking(null)).toBe(false);
    expect(isToneCheckBlocking(undefined)).toBe(false);
  });

  it('returns false when tone is OK and there is no calendar warning', () => {
    expect(isToneCheckBlocking({ isOk: true })).toBe(false);
    expect(isToneCheckBlocking({ isOk: true, calendarWarning: null })).toBe(false);
  });

  it('returns true when the tone check failed', () => {
    expect(isToneCheckBlocking({ isOk: false })).toBe(true);
  });

  it('returns true when tone is OK but a calendar warning is present', () => {
    expect(isToneCheckBlocking({ isOk: true, calendarWarning: 'Double-check the date' })).toBe(true);
  });
});
