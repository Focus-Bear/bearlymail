/**
 * Unit tests for EmailPhishingWarning helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { shouldShowPhishingAlert } from './emailPhishingWarning.helpers';

describe('shouldShowPhishingAlert', () => {
  it('returns true for "high" confidence', () => {
    expect(shouldShowPhishingAlert('high')).toBe(true);
  });

  it('returns true for "medium" confidence', () => {
    expect(shouldShowPhishingAlert('medium')).toBe(true);
  });

  it('returns false for "low" confidence', () => {
    expect(shouldShowPhishingAlert('low')).toBe(false);
  });

  it('returns false for null', () => {
    expect(shouldShowPhishingAlert(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(shouldShowPhishingAlert(undefined)).toBe(false);
  });
});
