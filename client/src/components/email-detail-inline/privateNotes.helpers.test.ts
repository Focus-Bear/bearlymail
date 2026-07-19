/**
 * Unit tests for PrivateNotesSection helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { humanizeDuration } from './privateNotes.helpers';

describe('humanizeDuration', () => {
  it('returns "just now" for 0ms', () => {
    expect(humanizeDuration(0)).toBe('just now');
  });

  it('returns "just now" for less than 5 seconds', () => {
    expect(humanizeDuration(4999)).toBe('just now');
  });

  it('returns "just now" for exactly 4 seconds', () => {
    expect(humanizeDuration(4000)).toBe('just now');
  });

  it('returns seconds ago for 5–59 seconds', () => {
    expect(humanizeDuration(5000)).toBe('5s ago');
    expect(humanizeDuration(30000)).toBe('30s ago');
    expect(humanizeDuration(59000)).toBe('59s ago');
  });

  it('returns minutes ago for 1–59 minutes', () => {
    expect(humanizeDuration(60000)).toBe('1m ago');
    expect(humanizeDuration(90000)).toBe('1m ago');
    expect(humanizeDuration(3540000)).toBe('59m ago');
  });

  it('returns hours ago for >= 1 hour', () => {
    expect(humanizeDuration(3600000)).toBe('1h ago');
    expect(humanizeDuration(7200000)).toBe('2h ago');
  });
});
