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

  it('the returned time is within 5 seconds of now (sanity check)', () => {
    const before = Date.now();
    const result = getCurrentTimeInTimezone('Australia/Melbourne');
    const after = Date.now();

    // Strip offset, parse as local UTC for comparison
    const localPart = result.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
    const offsetPart = result.slice(19);   // "+HH:MM" or "-HH:MM"
    const sign = offsetPart[0] === '+' ? 1 : -1;
    const [oh, om] = offsetPart.slice(1).split(':').map(Number);
    const offsetMs = sign * (oh * 60 + om) * 60 * 1000; // eslint-disable-line no-magic-numbers
    const parsedMs = Date.parse(`${localPart}Z`) - offsetMs;

    expect(parsedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(parsedMs).toBeLessThanOrEqual(after + 1000);
  });
});
