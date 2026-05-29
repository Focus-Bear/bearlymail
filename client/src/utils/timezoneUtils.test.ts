import { getCurrentTimeInTimezone } from './timezoneUtils';

describe('getCurrentTimeInTimezone', () => {
  const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  const UTC_ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it('returns a UTC ISO string when no timezone is provided', () => {
    const result = getCurrentTimeInTimezone();
    expect(result).toMatch(UTC_ISO_REGEX);
  });

  it('returns a UTC ISO string when timezone is an empty string', () => {
    const result = getCurrentTimeInTimezone('');
    expect(result).toMatch(UTC_ISO_REGEX);
  });

  it('returns a UTC ISO string for an invalid timezone', () => {
    const result = getCurrentTimeInTimezone('Not/A/Timezone');
    expect(result).toMatch(UTC_ISO_REGEX);
  });

  it('returns an offset-qualified ISO string for a valid IANA timezone', () => {
    const result = getCurrentTimeInTimezone('Australia/Melbourne');
    expect(result).toMatch(ISO_REGEX);
  });

  it('returns an offset-qualified ISO string for UTC timezone', () => {
    const result = getCurrentTimeInTimezone('UTC');
    expect(result).toMatch(ISO_REGEX);
    expect(result).toContain('+00:00');
  });

  it('returns an offset-qualified ISO string for America/New_York', () => {
    const result = getCurrentTimeInTimezone('America/New_York');
    expect(result).toMatch(ISO_REGEX);
  });

  it('returns an offset-qualified ISO string for Asia/Kolkata (UTC+5:30)', () => {
    const result = getCurrentTimeInTimezone('Asia/Kolkata');
    expect(result).toMatch(ISO_REGEX);
    // India is always UTC+05:30
    expect(result).toMatch(/\+05:30$/);
  });

  it('offset accurately reflects the timezone offset (within 1 minute)', () => {
    // For a fixed known point in time we can compute the expected offset.
    // Use UTC as a simple sanity check: local === UTC → offset = +00:00.
    const result = getCurrentTimeInTimezone('UTC');
    expect(result.endsWith('+00:00')).toBe(true);
  });

  it('handles midnight boundary (hour=24 overflow) without producing invalid ISO strings', () => {
    // Simulate a runtime that returns hour=24 for midnight via formatToParts.
    // The real bug: "2026-03-18T24:02:12-NaN:NaN" was returned at midnight UTC.
    // Use today's date so the computed offset stays within ±24h (2-digit HH).
    const today = new Date();
    const yyyy = String(today.getUTCFullYear());
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const mockParts = [
      { type: 'year', value: yyyy },
      { type: 'month', value: mm },
      { type: 'day', value: dd },
      { type: 'hour', value: '24' }, // edge case: some ICU builds return 24 at midnight
      { type: 'minute', value: '00' },
      { type: 'second', value: '00' },
      { type: 'literal', value: '/' },
    ] as Intl.DateTimeFormatPart[];

    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValueOnce(mockParts);

    const result = getCurrentTimeInTimezone('UTC');
    // Must not contain hour=24
    expect(result).not.toContain('T24:');
    // Must not contain NaN
    expect(result).not.toContain('NaN');
    // Must match valid ISO format (offset or UTC Z)
    expect(result).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    vi.restoreAllMocks();
  });

  describe('Windows-style timezone strings (regression for #1167)', () => {
    it('returns UTC ISO string for "AUS Eastern Standard Time"', () => {
      const result = getCurrentTimeInTimezone('AUS Eastern Standard Time');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
    it('returns UTC ISO string for "Eastern Standard Time"', () => {
      const result = getCurrentTimeInTimezone('Eastern Standard Time');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
    it('returns UTC ISO string for timezone string with spaces', () => {
      const result = getCurrentTimeInTimezone('Mountain Standard Time');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  it('the returned time is within 5 seconds of now (sanity check)', () => {
    // Use UTC — it is always a valid IANA timezone and always produces "+00:00",
    // making the offset arithmetic predictable across all runtime environments
    // (including jsdom, which may not support regional IANA zones like Australia/Melbourne).
    const before = Date.now();
    const result = getCurrentTimeInTimezone('UTC');
    const after = Date.now();

    // Strip offset, parse as local UTC for comparison
    const localPart = result.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
    const offsetPart = result.slice(19); // "+HH:MM" or "-HH:MM"
    const sign = offsetPart[0] === '+' ? 1 : -1;
    const [oh, om] = offsetPart.slice(1).split(':').map(Number);
    const offsetMs = sign * (oh * 60 + om) * 60 * 1000;
    const parsedMs = Date.parse(`${localPart}Z`) - offsetMs;

    expect(parsedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(parsedMs).toBeLessThanOrEqual(after + 1000);
  });
});
