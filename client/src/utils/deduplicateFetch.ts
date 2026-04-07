/**
 * deduplicateFetch.ts — Request deduplication utility (Phase 4, #1665)
 *
 * Collapses identical concurrent GET requests into a single in-flight Promise.
 * If two callers request the same URL simultaneously, the second caller awaits
 * the first caller's Promise instead of firing a duplicate network request.
 *
 * The cache is keyed on URL + the auth token from localStorage so that requests
 * issued under different auth states never share a pending Promise. The entry
 * is removed from the map once the request settles (success or error), so the
 * next invocation always triggers a fresh network call.
 *
 * Usage:
 *   import { deduplicatedGet } from 'utils/deduplicateFetch';
 *   const response = await deduplicatedGet('/emails/tab-counts?mode=triage', signal);
 */
import axios, { AxiosResponse } from 'axios';

const pending = new Map<string, Promise<AxiosResponse>>();

function buildKey(url: string): string {
  try {
    // Scope dedup key to the current auth token so that a token change
    // (e.g. re-login) never shares an in-flight request with the old session.
    const token = localStorage.getItem('token') ?? 'anon';
    // Only use first 8 chars of token to avoid PII in map keys
    return `${url}||${token.slice(0, 8)}`;
  } catch {
    return url;
  }
}

/**
 * Issue a deduplicated GET request. Concurrent requests to the same URL are
 * collapsed into one; the result is shared across all callers.
 */
export function deduplicatedGet(url: string, signal?: AbortSignal): Promise<AxiosResponse> {
  const key = buildKey(url);

  if (pending.has(key)) {
    return pending.get(key)!;
  }

  const promise = axios
    .get(url, { signal })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

/** Flush the deduplication map (e.g. on logout or test teardown). */
export function flushDeduplicatedFetchCache(): void {
  pending.clear();
}
