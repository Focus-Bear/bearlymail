/**
 * Unit tests for DeliveryTimesManager helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { formatTime12h } from './deliveryTimesManager.helpers';

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
