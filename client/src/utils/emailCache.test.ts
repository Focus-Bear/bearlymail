/**
 * Unit tests for emailCache.ts
 *
 * localStorage is provided by jsdom (configured via Vitest).
 */

import { Email } from 'types/email';

import { CategorySummaryItem } from 'store/slices/emailSlice';

import {
  CACHE_VERSION,
  clearCacheForMode,
  filterHash,
  getCachedCategoryEmails,
  getCachedSummary,
  removeEmailFromCache,
  setCachedCategoryEmails,
  setCachedSummary,
} from './emailCache';

// A minimal Email stub — only id is needed for cache filter tests
function makeEmail(id: string, subject = 'Test Subject'): Email {
  return { id, subject } as unknown as Email;
}

function makeSummaryItem(name: string, count: number): CategorySummaryItem {
  return { id: null, name, count };
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Summary cache ────────────────────────────────────────────────────────────

describe('getCachedSummary / setCachedSummary', () => {
  it('returns null when nothing is cached', () => {
    expect(getCachedSummary('inbox')).toBeNull();
  });

  it('round-trips summary data', () => {
    const summary = [makeSummaryItem('Work', 5), makeSummaryItem('Personal', 2)];
    setCachedSummary('inbox', summary);
    expect(getCachedSummary('inbox')).toEqual(summary);
  });

  it('isolates data by mode', () => {
    const inboxSummary = [makeSummaryItem('Work', 1)];
    const archiveSummary = [makeSummaryItem('Personal', 2)];
    setCachedSummary('inbox', inboxSummary);
    setCachedSummary('archive', archiveSummary);
    expect(getCachedSummary('inbox')).toEqual(inboxSummary);
    expect(getCachedSummary('archive')).toEqual(archiveSummary);
  });

  it('returns null if localStorage is corrupted', () => {
    localStorage.setItem('bearlymail_v2_summary_inbox_default', 'not-json{{{');
    expect(getCachedSummary('inbox')).toBeNull();
  });

  // ── TTL enforcement (fix #1114) ───────────────────────────────────────────

  it('returns null when cache is expired (TTL enforcement)', () => {
    const summary = [makeSummaryItem('Work', 5)];
    setCachedSummary('inbox', summary);

    // Backdate the stored timestamp by 2 minutes so the 60 s TTL has elapsed
    const key = `bearlymail_${CACHE_VERSION}_summary_inbox`;
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const entry = JSON.parse(raw!);
    entry.timestamp = Date.now() - 120_000; // 2 minutes ago
    localStorage.setItem(key, JSON.stringify(entry));

    // With maxAgeMs = 60 000, the entry should be treated as a cache miss
    expect(getCachedSummary('inbox', 60_000)).toBeNull();
  });

  it('returns cached value when cache is still fresh (within TTL)', () => {
    const summary = [makeSummaryItem('Personal', 3)];
    setCachedSummary('inbox', summary);

    // Entry was just written — timestamp is ~now, well within 60 s TTL
    expect(getCachedSummary('inbox', 60_000)).toEqual(summary);
  });
});

// ─── Category email cache ─────────────────────────────────────────────────────

describe('getCachedCategoryEmails / setCachedCategoryEmails', () => {
  it('returns null when nothing is cached', () => {
    expect(getCachedCategoryEmails('inbox', 'work')).toBeNull();
  });

  it('round-trips category emails', () => {
    const emails = [makeEmail('email-1'), makeEmail('email-2')];
    setCachedCategoryEmails('inbox', 'work', emails);
    expect(getCachedCategoryEmails('inbox', 'work')).toEqual(emails);
  });

  it('caps stored emails at 100', () => {
    const emails = Array.from({ length: 150 }, (_, i) => makeEmail(`id-${i}`));
    setCachedCategoryEmails('inbox', 'work', emails);
    const result = getCachedCategoryEmails('inbox', 'work');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(100);
    expect(result![0].id).toBe('id-0');
  });

  it('isolates data by mode and category key', () => {
    const workEmails = [makeEmail('a-1')];
    const personalEmails = [makeEmail('b-1')];
    setCachedCategoryEmails('inbox', 'work', workEmails);
    setCachedCategoryEmails('inbox', 'personal', personalEmails);
    expect(getCachedCategoryEmails('inbox', 'work')).toEqual(workEmails);
    expect(getCachedCategoryEmails('inbox', 'personal')).toEqual(personalEmails);
  });

  it('sanitises special characters in category keys', () => {
    const emails = [makeEmail('x')];
    // key with spaces and slashes — should not blow up storage key
    setCachedCategoryEmails('inbox', 'My Category / Sub', emails);
    expect(getCachedCategoryEmails('inbox', 'My Category / Sub')).toEqual(emails);
  });

  // ── TTL enforcement (fix #1769) ───────────────────────────────────────────

  it('returns null when cache is expired (TTL enforcement)', () => {
    const emails = [makeEmail('e-1')];
    setCachedCategoryEmails('inbox', 'work', emails);

    // Backdate the stored timestamp so the TTL has elapsed
    const key = `bearlymail_${CACHE_VERSION}_cat_inbox_work`;
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const entry = JSON.parse(raw!);
    entry.timestamp = Date.now() - 400_000; // 6+ minutes ago — well past the TTL
    localStorage.setItem(key, JSON.stringify(entry));

    expect(getCachedCategoryEmails('inbox', 'work', 300_000)).toBeNull();
  });

  it('returns cached value when cache is still within TTL', () => {
    const emails = [makeEmail('e-2')];
    setCachedCategoryEmails('inbox', 'work', emails);
    // Entry was just written — timestamp is ~now, well within the TTL
    expect(getCachedCategoryEmails('inbox', 'work', 300_000)).toEqual(emails);
  });

  it('returns cached value when no TTL is provided (default Infinity)', () => {
    const emails = [makeEmail('e-3')];
    setCachedCategoryEmails('inbox', 'personal', emails);

    // Backdate the entry far in the past
    const key = `bearlymail_${CACHE_VERSION}_cat_inbox_personal`;
    const raw = localStorage.getItem(key);
    const entry = JSON.parse(raw!);
    entry.timestamp = Date.now() - 86_400_000; // 24 hours ago
    localStorage.setItem(key, JSON.stringify(entry));

    // No maxAgeMs passed → Infinity → always returns cached value
    expect(getCachedCategoryEmails('inbox', 'personal')).toEqual(emails);
  });
});

// ─── removeEmailFromCache ─────────────────────────────────────────────────────

describe('removeEmailFromCache', () => {
  it('removes the target email from a single category', () => {
    const emails = [makeEmail('keep-1'), makeEmail('remove-me'), makeEmail('keep-2')];
    setCachedCategoryEmails('inbox', 'work', emails);

    removeEmailFromCache('remove-me');

    const result = getCachedCategoryEmails('inbox', 'work');
    expect(result).toEqual([makeEmail('keep-1'), makeEmail('keep-2')]);
  });

  it('removes the target email from multiple categories simultaneously', () => {
    setCachedCategoryEmails('inbox', 'work', [makeEmail('shared'), makeEmail('work-only')]);
    setCachedCategoryEmails('inbox', 'personal', [makeEmail('personal-only'), makeEmail('shared')]);

    removeEmailFromCache('shared');

    expect(getCachedCategoryEmails('inbox', 'work')).toEqual([makeEmail('work-only')]);
    expect(getCachedCategoryEmails('inbox', 'personal')).toEqual([makeEmail('personal-only')]);
  });

  it('does not affect summary cache keys', () => {
    const summary = [makeSummaryItem('Work', 3)];
    setCachedSummary('inbox', summary);

    removeEmailFromCache('some-email-id');

    expect(getCachedSummary('inbox')).toEqual(summary);
  });

  it('is a no-op when the email is not present in any category', () => {
    const emails = [makeEmail('keep-1'), makeEmail('keep-2')];
    setCachedCategoryEmails('inbox', 'work', emails);

    removeEmailFromCache('does-not-exist');

    expect(getCachedCategoryEmails('inbox', 'work')).toEqual(emails);
  });

  it('does not throw when localStorage is empty', () => {
    expect(() => removeEmailFromCache('any-id')).not.toThrow();
  });
});

// ─── clearCacheForMode ────────────────────────────────────────────────────────

describe('clearCacheForMode', () => {
  it('removes all cache entries for the specified mode', () => {
    setCachedSummary('inbox', [makeSummaryItem('Work', 1)]);
    setCachedCategoryEmails('inbox', 'work', [makeEmail('e1')]);
    setCachedCategoryEmails('inbox', 'personal', [makeEmail('e2')]);

    clearCacheForMode('inbox');

    expect(getCachedSummary('inbox')).toBeNull();
    expect(getCachedCategoryEmails('inbox', 'work')).toBeNull();
    expect(getCachedCategoryEmails('inbox', 'personal')).toBeNull();
  });

  it('does not remove entries for other modes', () => {
    const archiveEmails = [makeEmail('archive-1')];
    setCachedCategoryEmails('inbox', 'work', [makeEmail('inbox-1')]);
    setCachedCategoryEmails('archive', 'work', archiveEmails);

    clearCacheForMode('inbox');

    // archive mode should be untouched
    expect(getCachedCategoryEmails('archive', 'work')).toEqual(archiveEmails);
  });

  it('is a no-op when no entries exist for the mode', () => {
    expect(() => clearCacheForMode('nonexistent-mode')).not.toThrow();
  });
});

// ─── Filter-change cache invalidation (fix #846) ──────────────────────────────

describe('clearCacheForMode — filter change invalidation', () => {
  it('clears all summary and category caches for the mode when filters change', () => {
    setCachedSummary('triage', [makeSummaryItem('Work', 5)]);
    setCachedCategoryEmails('triage', 'uuid-work-0001', [makeEmail('e1')]);
    setCachedCategoryEmails('triage', 'uuid-personal-0002', [makeEmail('e2')]);

    clearCacheForMode('triage');

    expect(getCachedSummary('triage')).toBeNull();
    expect(getCachedCategoryEmails('triage', 'uuid-work-0001')).toBeNull();
    expect(getCachedCategoryEmails('triage', 'uuid-personal-0002')).toBeNull();
  });

  it('preserves caches for other modes when a specific mode is invalidated', () => {
    const actionSummary = [makeSummaryItem('Newsletters', 3)];
    const actionEmails = [makeEmail('action-e1')];
    setCachedSummary('triage', [makeSummaryItem('Work', 2)]);
    setCachedSummary('action', actionSummary);
    setCachedCategoryEmails('action', 'uuid-nl-0003', actionEmails);

    clearCacheForMode('triage');

    expect(getCachedSummary('action')).toEqual(actionSummary);
    expect(getCachedCategoryEmails('action', 'uuid-nl-0003')).toEqual(actionEmails);
  });
});

// ─── filterHash ───────────────────────────────────────────────────────────────

describe('filterHash', () => {
  it('returns the same hash for identical filter values', () => {
    const hashA = filterHash({ minPriority: 2, maxPriority: 5 });
    const hashB = filterHash({ minPriority: 2, maxPriority: 5 });
    expect(hashA).toBe(hashB);
  });

  it('returns different hashes for different filter values', () => {
    const hashA = filterHash({ minPriority: 1, maxPriority: 5 });
    const hashB = filterHash({ minPriority: 2, maxPriority: 5 });
    expect(hashA).not.toBe(hashB);
  });

  it('treats null and undefined as equivalent (both map to "null")', () => {
    const withNull = filterHash({ minPriority: null, maxPriority: null });
    const withUndefined = filterHash({ minPriority: undefined, maxPriority: undefined });
    expect(withNull).toBe(withUndefined);
  });

  it('treats omitted fields as equivalent to undefined', () => {
    const omitted = filterHash({});
    const explicit = filterHash({ minPriority: undefined, maxPriority: undefined });
    expect(omitted).toBe(explicit);
  });

  it('treats zero as a valid, distinct priority value (not coerced to null)', () => {
    const withZero = filterHash({ minPriority: 0, maxPriority: 0 });
    const withNull = filterHash({ minPriority: null, maxPriority: null });
    expect(withZero).not.toBe(withNull);
  });

  it('produces different hashes when only maxPriority differs', () => {
    const hashA = filterHash({ minPriority: 1, maxPriority: 3 });
    const hashB = filterHash({ minPriority: 1, maxPriority: 10 });
    expect(hashA).not.toBe(hashB);
  });

  it('produces different hashes when only minPriority differs', () => {
    const hashA = filterHash({ minPriority: 1, maxPriority: 5 });
    const hashB = filterHash({ minPriority: 3, maxPriority: 5 });
    expect(hashA).not.toBe(hashB);
  });

  it.each([
    [{ minPriority: 50, maxPriority: null }, 'p50_pnull'],
    [{ minPriority: null, maxPriority: null }, 'pnull_pnull'],
    [{ minPriority: null, maxPriority: 30 }, 'pnull_p30'],
    [{ minPriority: 10, maxPriority: 30 }, 'p10_p30'],
  ])('filterHash($route) returns $expected', ({ minPriority, maxPriority }, expected) => {
    expect(filterHash({ minPriority, maxPriority })).toBe(expected);
  });
});
