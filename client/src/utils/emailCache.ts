/**
 * Client-side localStorage cache for inbox emails.
 *
 * Pattern: stale-while-revalidate.
 * - On load: serve cached data immediately (no spinner), then refresh in background.
 * - On archive: remove the email from cache optimistically.
 * - TTL: 5 minutes. After that the cache is treated as stale but still shown while
 *   a background refresh runs.
 */
import { Email } from 'types/email';

import { CategorySummaryItem } from 'store/slices/emailSlice';

// Bump to v2 to force-invalidate all localStorage caches written before fix #1114.
// Those caches may contain stale/wrong UUIDs that trigger the silent-skip bug.
const CACHE_VERSION = 'v2';
const MAX_EMAILS_PER_CATEGORY = 100;

interface CachedEntry<T> {
  payload: T;
  timestamp: number;
}

function summaryKey(mode: string): string {
  return `bearlymail_${CACHE_VERSION}_summary_${mode}`;
}

function categoryKey(mode: string, key: string): string {
  // Sanitise the key so it's safe to use in a storage key
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `bearlymail_${CACHE_VERSION}_cat_${mode}_${safe}`;
}

function safeGet<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const entry: CachedEntry<T> = JSON.parse(raw);
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
 */
export function getCachedSummary(mode: string, maxAgeMs = Infinity): CategorySummaryItem[] | null {
  try {
    const raw = localStorage.getItem(summaryKey(mode));
    if (!raw) {
      return null;
    }
    const entry: CachedEntry<CategorySummaryItem[]> = JSON.parse(raw);
    if (maxAgeMs !== Infinity && Date.now() - entry.timestamp > maxAgeMs) {
      return null; // Treat as cache miss — TTL expired
    }
    return entry.payload;
  } catch {
    return null;
  }
}

export function setCachedSummary(mode: string, summary: CategorySummaryItem[]): void {
  safeSet(summaryKey(mode), summary);
}

// ─── Category emails ───────────────────────────────────────────────────────────

export function getCachedCategoryEmails(mode: string, key: string): Email[] | null {
  return safeGet<Email[]>(categoryKey(mode, key));
}

export function setCachedCategoryEmails(mode: string, key: string, emails: Email[]): void {
  // Cap to avoid blowing up localStorage on large inboxes
  const capped = emails.slice(0, MAX_EMAILS_PER_CATEGORY);
  safeSet(categoryKey(mode, key), capped);
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
 * Clear all inbox cache entries for a given mode (e.g. when switching modes).
 */
export function clearCacheForMode(mode: string): void {
  try {
    const prefix = `bearlymail_${CACHE_VERSION}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && key.includes(`_${mode}_`)) {
        keysToRemove.push(key);
      }
    }
    // Also remove summary key
    keysToRemove.push(summaryKey(mode));
    keysToRemove.forEach(storKey => localStorage.removeItem(storKey));
  } catch {
    // Fail silently
  }
}
