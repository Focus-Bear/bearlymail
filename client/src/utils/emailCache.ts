/**
 * Client-side localStorage cache for inbox emails.
 *
 * Pattern: stale-while-revalidate.
 * - On load: serve cached data immediately (no spinner), then refresh in background.
 * - On archive: remove the email from cache optimistically.
 * - TTL: 60 seconds. After that the cache is treated as stale but still shown while
 *   a background refresh runs.
 *
 * Fix #1571 Bug 1: cache keys now include a filter hash so that stale-while-revalidate
 * never serves data from a different filter configuration. Bump CACHE_VERSION to v3
 * to force-invalidate all v2 entries written without filter hashes.
 */
import { Email } from 'types/email';

import { CategorySummaryItem } from 'store/slices/emailSlice';

// Bump to v3 to force-invalidate v2 caches that lack filter-hash segments (#1571).
// v2 → v3: add filterHash to summary and category keys.
export const CACHE_VERSION = 'v3';
const MAX_EMAILS_PER_CATEGORY = 100;

interface CachedEntry<T> {
  payload: T;
  timestamp: number;
}

/**
 * Produce a stable short hash string from the active filter state.
 * Used to scope cache keys so stale-while-revalidate never serves data from a
 * different filter configuration (fix #1571 Bug 1).
 *
 * Only priority filters affect the email set returned by the server, so we
 * only hash minPriority and maxPriority. Category and account filters are
 * applied client-side (they don't change the top-level email fetch result).
 */
export interface FilterHashParams {
  minPriority?: number | null;
  maxPriority?: number | null;
}

export function filterHash(params: FilterHashParams): string {
  const min = params.minPriority ?? 'null';
  const max = params.maxPriority ?? 'null';
  return `p${min}_p${max}`;
}

function summaryKey(mode: string, hash?: string): string {
  if (hash) {
    return `bearlymail_${CACHE_VERSION}_summary_${mode}_${hash}`;
  }
  return `bearlymail_${CACHE_VERSION}_summary_${mode}`;
}

function categoryKey(mode: string, key: string, hash?: string): string {
  // Sanitise the key so it's safe to use in a storage key
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (hash) {
    return `bearlymail_${CACHE_VERSION}_cat_${mode}_${safe}_${hash}`;
  }
  return `bearlymail_${CACHE_VERSION}_cat_${mode}_${safe}`;
}

/**
 * Retrieve an entry from localStorage, returning its payload only if the entry
 * exists and has not exceeded `maxAgeMs`. Returns `null` on any cache miss,
 * TTL expiry, or parse error.
 */
function getWithTTL<T>(storageKey: string, maxAgeMs = Infinity): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const entry: CachedEntry<T> = JSON.parse(raw);
    if (maxAgeMs !== Infinity && Date.now() - entry.timestamp > maxAgeMs) {
      return null; // Treat as cache miss — TTL expired
    }
    return entry.payload;
  } catch {
    return null;
  }
}

function safeSet<T>(storageKey: string, value: T): void {
  try {
    const entry: CachedEntry<T> = { payload: value, timestamp: Date.now() };
    localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or not available — fail silently
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Return the cached summary only if it was stored within the last `maxAgeMs`
 * milliseconds. Pass `Infinity` (or omit) to skip TTL enforcement.
 *
 * Fix #1114: previously this function ignored the stored timestamp and always
 * returned a cached value, allowing stale UUIDs to persist indefinitely and
 * trigger the backend's silent-skip bug.
 *
 * Fix #1571 Bug 1: accepts optional `hash` to scope the cache key to the
 * current filter configuration. Pass `filterHash(filters)` at the call site.
 */
export function getCachedSummary(mode: string, maxAgeMs = Infinity, hash?: string): CategorySummaryItem[] | null {
  return getWithTTL<CategorySummaryItem[]>(summaryKey(mode, hash), maxAgeMs);
}

export function setCachedSummary(mode: string, summary: CategorySummaryItem[], hash?: string): void {
  safeSet(summaryKey(mode, hash), summary);
}

/**
 * Invalidate the triage/action summary cache for a given mode.
 * Call this after prioritisation actions that move emails between modes
 * so that category counts are refetched on next render.
 *
 * Fix #1571 Bug 1: clears ALL filter variants for the given mode by iterating
 * localStorage keys with the mode prefix, not just a single key.
 */
export function invalidateSummaryCache(mode: string): void {
  try {
    const prefix = `bearlymail_${CACHE_VERSION}_summary_${mode}`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(prefix)) {
        keysToRemove.push(storageKey);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Fail silently
  }
}

// ─── Category emails ───────────────────────────────────────────────────────────

/**
 * Return cached category emails only if they were stored within the last `maxAgeMs`
 * milliseconds. Pass `Infinity` (default) to skip TTL enforcement.
 *
 * Fix #1769: category emails now honour the same TTL as the summary cache so that
 * stale entries are re-fetched rather than served indefinitely.
 */
export function getCachedCategoryEmails(mode: string, key: string, maxAgeMs = Infinity, hash?: string): Email[] | null {
  return getWithTTL<Email[]>(categoryKey(mode, key, hash), maxAgeMs);
}

export function setCachedCategoryEmails(mode: string, key: string, emails: Email[], hash?: string): void {
  // Cap to avoid blowing up localStorage on large inboxes
  const capped = emails.slice(0, MAX_EMAILS_PER_CATEGORY);
  safeSet(categoryKey(mode, key, hash), capped);
}

// ─── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Remove a single email from all cached category email lists.
 * Call this immediately after an optimistic archive so the cache stays consistent
 * and the archived email doesn't reappear when the user navigates back.
 */
export function removeEmailFromCache(emailId: string): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`bearlymail_${CACHE_VERSION}_cat_`)) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const entry: CachedEntry<Email[]> = JSON.parse(raw);
      const filtered = entry.payload.filter(email => email.id !== emailId);
      if (filtered.length !== entry.payload.length) {
        localStorage.setItem(key, JSON.stringify({ ...entry, payload: filtered }));
      }
    }
  } catch {
    // Fail silently
  }
}

/**
 * Clear all inbox cache entries for a given mode (e.g. when switching modes or changing filters).
 *
 * Fix #1571 Bug 1: iterates all localStorage keys and removes any that belong to this mode,
 * including filter-hash variants (e.g. `…_summary_triage_pnull_pnull`).
 */
export function clearCacheForMode(mode: string): void {
  try {
    const prefix = `bearlymail_${CACHE_VERSION}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Match `_cat_<mode>_*` and `_summary_<mode>` (exact, no hash) or `_summary_<mode>_*` (with hash).
      // The trailing-delimited check avoids hypothetical `_summary_triage2_` false-positives.
      if (
        key?.startsWith(prefix) &&
        (key.includes(`_cat_${mode}_`) || key.includes(`_summary_${mode}_`) || key.endsWith(`_summary_${mode}`))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(storageKey => localStorage.removeItem(storageKey));
  } catch {
    // Fail silently
  }
}
