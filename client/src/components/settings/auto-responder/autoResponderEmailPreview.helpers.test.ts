/**
 * Unit tests for AutoResponderEmailPreview helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 *
 * NOTE: formatDate uses toLocaleDateString, which is locale-sensitive.
 * Tests focus on structural correctness (returns a non-empty string, parses
 * valid dates) rather than exact locale-specific output.
 */
import { formatDate } from './autoResponderEmailPreview.helpers';

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2024-03-15T14:30:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the day portion of the date', () => {
    // formatDate renders in local time, so derive the expected day-of-month
    // from the same local conversion — otherwise this assertion is fragile in
    // timezones where the UTC instant falls on a different calendar day.
    const iso = '2024-03-15T14:30:00.000Z';
    const result = formatDate(iso);
    const localDay = String(new Date(iso).getDate());
    expect(result).toContain(localDay);
  });

  it('includes time digits for hours and minutes', () => {
    // The result should contain two digit-colon-digit patterns for HH:MM
    const result = formatDate('2024-03-15T14:30:00.000Z');
    expect(result).toMatch(/\d+:\d+/);
  });

  it('handles epoch start date without throwing', () => {
    expect(() => formatDate('1970-01-01T00:00:00.000Z')).not.toThrow();
  });

  it('handles midnight UTC without throwing', () => {
    expect(() => formatDate('2024-01-01T00:00:00.000Z')).not.toThrow();
  });
});
