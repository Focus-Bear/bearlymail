/**
 * Unit tests for the filtersChanged logic in useInboxState.
 *
 * Issue #1101: maxPriority was missing from filter change detection,
 * so switching from a bounded priority range where only maxPriority
 * changes did not trigger a re-fetch.
 *
 * These tests exercise the comparison logic in isolation using plain objects
 * (mirroring the InboxFilters shape) so we don't need the full hook stack.
 */

import { InboxFilter } from 'hooks/useInboxFilters';

// Mirror the filtersChanged logic from useInboxState.ts so we can unit-test it
// without rendering the full hook (which has many context dependencies).
function filtersChanged(prev: InboxFilter, current: InboxFilter): boolean {
  return (
    prev.minPriority !== current.minPriority ||
    prev.maxPriority !== current.maxPriority ||
    prev.categories.join(',') !== current.categories.join(',') ||
    prev.accountIds.join(',') !== current.accountIds.join(',')
  );
}

function makeFilters(overrides: Partial<InboxFilter> = {}): InboxFilter {
  return {
    accountIds: [],
    categories: [],
    minPriority: null,
    maxPriority: null,
    ...overrides,
  };
}

describe('useInboxState — filtersChanged logic (#1101)', () => {
  it('returns false when nothing changes', () => {
    const filters = makeFilters({ minPriority: 30, maxPriority: 50 });
    expect(filtersChanged(filters, { ...filters })).toBe(false);
  });

  it('returns true when only minPriority changes', () => {
    const prev = makeFilters({ minPriority: 30, maxPriority: null });
    const next = makeFilters({ minPriority: 50, maxPriority: null });
    expect(filtersChanged(prev, next)).toBe(true);
  });

  it('returns true when only maxPriority changes (#1101 regression)', () => {
    // e.g. switching from "Very High (>50)" to "High (30-50)"
    // minPriority stays the same (30), only maxPriority changes (null → 50)
    const prev = makeFilters({ minPriority: 30, maxPriority: null });
    const next = makeFilters({ minPriority: 30, maxPriority: 50 });
    expect(filtersChanged(prev, next)).toBe(true);
  });

  it('returns true when maxPriority changes from bounded to unbounded', () => {
    const prev = makeFilters({ minPriority: 30, maxPriority: 50 });
    const next = makeFilters({ minPriority: 30, maxPriority: null });
    expect(filtersChanged(prev, next)).toBe(true);
  });

  it('returns true when only categories change', () => {
    const prev = makeFilters({ categories: ['Work'] });
    const next = makeFilters({ categories: ['Personal'] });
    expect(filtersChanged(prev, next)).toBe(true);
  });

  it('returns true when only accountIds change', () => {
    const prev = makeFilters({ accountIds: ['acc-1'] });
    const next = makeFilters({ accountIds: ['acc-2'] });
    expect(filtersChanged(prev, next)).toBe(true);
  });

  it('returns false when all fields are null/empty and unchanged', () => {
    const filters = makeFilters();
    expect(filtersChanged(filters, { ...filters })).toBe(false);
  });
});
