/**
 * Unit tests for JobsTableBody helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { formatDuration } from './jobsTable.helpers';

const tFunc = (key: string): string => key;

describe('formatDuration', () => {
  it('returns tFunc("admin.jobs.noData") for null', () => {
    expect(formatDuration(null, tFunc)).toBe('admin.jobs.noData');
  });

  it('returns "0ms" for 0 milliseconds', () => {
    expect(formatDuration(0, tFunc)).toBe('0ms');
  });

  it('returns "500ms" for 500 milliseconds', () => {
    expect(formatDuration(500, tFunc)).toBe('500ms');
  });

  it('returns "999ms" for 999 milliseconds', () => {
    expect(formatDuration(999, tFunc)).toBe('999ms');
  });

  it('returns "1.0s" for exactly 1000 milliseconds', () => {
    expect(formatDuration(1000, tFunc)).toBe('1.0s');
  });

  it('returns "1.5s" for 1500 milliseconds', () => {
    expect(formatDuration(1500, tFunc)).toBe('1.5s');
  });

  it('returns "1m 30s" for 90000 milliseconds', () => {
    expect(formatDuration(90000, tFunc)).toBe('1m 30s');
  });

  it('returns "60m 0s" for 3600000 milliseconds (1 hour)', () => {
    expect(formatDuration(3600000, tFunc)).toBe('60m 0s');
  });

  it('returns "2m 0s" for exactly 2 minutes', () => {
    expect(formatDuration(120000, tFunc)).toBe('2m 0s');
  });
});
