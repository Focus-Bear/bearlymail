/**
 * Unit tests for DeliveryTimesManager helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import {
  buildTime24h,
  DEFAULT_DELIVERY_TIME_24H,
  formatTime12h,
  isValidTime24h,
  parseTime12h,
} from './deliveryTimesManager.helpers';

describe('formatTime12h', () => {
  it('converts midnight "00:00" to "12:00 AM"', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM');
  });

  it('converts "01:00" to "1:00 AM"', () => {
    expect(formatTime12h('01:00')).toBe('1:00 AM');
  });

  it('converts "09:30" to "9:30 AM"', () => {
    expect(formatTime12h('09:30')).toBe('9:30 AM');
  });

  it('converts "12:00" to "12:00 PM"', () => {
    expect(formatTime12h('12:00')).toBe('12:00 PM');
  });

  it('converts "13:30" to "1:30 PM"', () => {
    expect(formatTime12h('13:30')).toBe('1:30 PM');
  });

  it('converts "23:59" to "11:59 PM"', () => {
    expect(formatTime12h('23:59')).toBe('11:59 PM');
  });

  it('pads minutes correctly for "08:05"', () => {
    expect(formatTime12h('08:05')).toBe('8:05 AM');
  });
});

describe('isValidTime24h', () => {
  it('accepts well-formed times', () => {
    expect(isValidTime24h('00:00')).toBe(true);
    expect(isValidTime24h('23:59')).toBe(true);
    expect(isValidTime24h('09:05')).toBe(true);
  });

  it('rejects empty or malformed values', () => {
    expect(isValidTime24h('')).toBe(false);
    expect(isValidTime24h('9')).toBe(false);
    expect(isValidTime24h('24:00')).toBe(false);
    expect(isValidTime24h('10:60')).toBe(false);
    expect(isValidTime24h('nope')).toBe(false);
  });
});

describe('parseTime12h', () => {
  it('splits a 24-hour value into 12-hour parts', () => {
    expect(parseTime12h('15:30')).toEqual({ hour12: 3, minute: 30, meridiem: 'PM' });
    expect(parseTime12h('00:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(parseTime12h('12:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'PM' });
  });

  it('falls back to the default for empty/invalid input', () => {
    expect(parseTime12h('')).toEqual(parseTime12h(DEFAULT_DELIVERY_TIME_24H));
    expect(parseTime12h('bogus')).toEqual(parseTime12h(DEFAULT_DELIVERY_TIME_24H));
  });
});

describe('buildTime24h', () => {
  it('rebuilds a zero-padded 24-hour value', () => {
    expect(buildTime24h({ hour12: 3, minute: 5, meridiem: 'PM' })).toBe('15:05');
    expect(buildTime24h({ hour12: 12, minute: 0, meridiem: 'AM' })).toBe('00:00');
    expect(buildTime24h({ hour12: 12, minute: 0, meridiem: 'PM' })).toBe('12:00');
  });

  it('round-trips with parseTime12h', () => {
    for (const time of ['00:00', '09:05', '12:00', '13:30', '23:59']) {
      expect(buildTime24h(parseTime12h(time))).toBe(time);
    }
  });
});
