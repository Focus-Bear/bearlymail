/**
 * Unit tests for emailCache.ts
 *
 * localStorage is provided by jsdom (configured via Jest/ts-jest).
 */

import {
  clearCacheForMode,
  getCachedCategoryEmails,
  getCachedSummary,
  removeEmailFromCache,
  setCachedCategoryEmails,
  setCachedSummary,
} from './emailCache';

// A minimal Email stub — only id is needed for cache filter tests
function makeEmail(id: string, subject = 'Test Subject') {
  return { id, subject } as any;
}

function makeSummaryItem(name: string, count: number) {
  return { id: null, name, count } as any;
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
    localStorage.setItem('bearlymail_v1_summary_inbox', 'not-json{{{');
    expect(getCachedSummary('inbox')).toBeNull();
  });

  // ── TTL enforcement (fix #1114) ───────────────────────────────────────────

  it('returns null when cache is expired (TTL enforcement)', () => {
    const summary = [makeSummaryItem('Work', 5)];
    setCachedSummary('inbox', summary);

    // Backdate the stored timestamp by 2 minutes so the 60 s TTL has elapsed
    const key = 'bearlymail_v2_summary_inbox';
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
