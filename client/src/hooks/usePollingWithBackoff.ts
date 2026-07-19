/**
 * usePollingWithBackoff — shared exponential-backoff / circuit-breaker utility.
 *
 * All backoff state is stored in refs (never React state) so that tracking
 * updates are completely invisible to React's render cycle. This is the key
 * design choice: storing backoff state in useState would trigger re-renders,
 * which is exactly what fires Effect 2 in useInboxCategoryAccordion and causes
 * the tight 429 retry loop.
 *
 * @see plans/1054-1055-email-fetch-backoff.md
 */
import { useCallback, useMemo, useRef } from 'react';

import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  BACKOFF_MAX_MS,
  BACKOFF_MULTIPLIER,
  HTTP_TOO_MANY_REQUESTS,
  MS_PER_SECOND,
  RETRY_AFTER_MIN_MS,
} from 'constants/numbers';

export interface BackoffState {
  retryCount: number;
  /** Epoch ms — do not attempt the next fetch before this timestamp. */
  nextAllowedAt: number;
  /** True once maxRetries is reached; caller should surface a permanent error. */
  exhausted: boolean;
}

export interface UsePollingWithBackoffOptions {
  maxRetries: number;
}

export interface BackoffContext {
  /**
   * Returns the BackoffState for a key, or undefined if the key has never failed.
   */
  getState: (key: string) => BackoffState | undefined;

  /**
   * Call this after a successful fetch for `key` to reset its backoff state.
   */
  onSuccess: (key: string) => void;

  /**
   * Call this after a failed fetch for `key`.
   * Returns the updated BackoffState (including `exhausted` flag and `nextAllowedAt`).
   * Pass the raw error so the utility can inspect the `Retry-After` header.
   */
  onError: (key: string, error: unknown) => BackoffState;

  /**
   * Returns true if a fetch for `key` is currently in-flight.
   */
  isInFlight: (key: string) => boolean;

  /**
   * Mark a key as in-flight (call before dispatching the fetch).
   */
  markInFlight: (key: string) => void;

  /**
   * Mark a key as no longer in-flight (call in finally block).
   */
  clearInFlight: (key: string) => void;

  /**
   * Returns true if the fetch for `key` should be skipped on this evaluation:
   * - in-flight already, OR
   * - backoff window hasn't elapsed yet, OR
   * - retries exhausted
   */
  shouldSkip: (key: string) => boolean;

  /**
   * Cancel all pending backoff timers (call on unmount).
   * Note: consumers manage their own retry timers; this cancels any timers
   * that usePollingWithBackoff itself has registered internally.
   */
  cancelAll: () => void;
}

/**
 * Pure helper — compute exponential backoff delay for a given retry count.
 * delay = min(base × 2^retryCount, max) ± jitter
 */
export function computeBackoffDelay(retryCount: number): number {
  const exp = Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, retryCount), BACKOFF_MAX_MS);
  const jitter = (Math.random() * 2 - 1) * BACKOFF_JITTER_MS; // ±500ms
  return Math.max(0, Math.round(exp + jitter));
}

/**
 * Extract Retry-After delay from an Axios-style error response.
 * Handles both integer-seconds and HTTP-date formats.
 * Returns ms to wait, or null if header absent/unparseable.
 * Always enforces RETRY_AFTER_MIN_MS floor.
 */
export function parseRetryAfterMs(error: unknown): number | null {
  const headers = (error as { response?: { headers?: Record<string, string> } })?.response?.headers;
  if (!headers) {
    return null;
  }
  const raw: string | undefined = headers['retry-after'] ?? headers['Retry-After'];
  if (!raw) {
    return null;
  }

  // Try integer seconds first
  const seconds = parseFloat(raw);
  if (!isNaN(seconds)) {
    return Math.max(seconds * MS_PER_SECOND, RETRY_AFTER_MIN_MS);
  }

  // Try HTTP-date format (e.g. "Mon, 16 Mar 2026 04:30:00 GMT")
  const date = Date.parse(raw);
  if (!isNaN(date)) {
    return Math.max(date - Date.now(), RETRY_AFTER_MIN_MS);
  }

  return null;
}

/**
 * usePollingWithBackoff — shared backoff/circuit-breaker context.
 *
 * Usage:
 *   const backoff = usePollingWithBackoff({ maxRetries: MAX_CATEGORY_FETCH_RETRIES });
 *
 *   // Before each fetch:
 *   if (backoff.shouldSkip(key)) return;
 *   backoff.markInFlight(key);
 *   try {
 *     const res = await axios.get(...);
 *     backoff.onSuccess(key);
 *   } catch (err) {
 *     const state = backoff.onError(key, err);
 *     if (state.exhausted) { /* surface permanent error *\/ }
 *     // else: schedule retry after state.nextAllowedAt - Date.now()
 *   } finally {
 *     backoff.clearInFlight(key);
 *   }
 */
export function usePollingWithBackoff({ maxRetries }: UsePollingWithBackoffOptions): BackoffContext {
  // Per-key backoff states — stored in ref, never triggers re-renders
  const statesRef = useRef<Map<string, BackoffState>>(new Map());
  // Per-key in-flight tracking
  const inFlightRef = useRef<Set<string>>(new Set());
  // Internal timer handles for cleanup on unmount
  // (consumers manage their own retry timers; this tracks any timers usePollingWithBackoff
  // itself registers — currently none, but cancelAll() is available for safety)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const getState = useCallback((key: string) => statesRef.current.get(key), []);

  const onSuccess = useCallback((key: string) => {
    statesRef.current.delete(key);
  }, []);

  const onError = useCallback(
    (key: string, error: unknown): BackoffState => {
      const existing = statesRef.current.get(key);
      const prevRetryCount = existing?.retryCount ?? 0;
      const newRetryCount = prevRetryCount + 1;
      const exhausted = newRetryCount >= maxRetries;

      // Respect Retry-After header for 429 responses; fall back to exponential backoff
      const is429 = (error as { response?: { status?: number } })?.response?.status === HTTP_TOO_MANY_REQUESTS;
      let delayMs: number;
      if (is429) {
        delayMs = parseRetryAfterMs(error) ?? Math.max(computeBackoffDelay(newRetryCount), RETRY_AFTER_MIN_MS);
      } else {
        delayMs = computeBackoffDelay(newRetryCount);
      }

      const nextAllowedAt = Date.now() + delayMs;
      const state: BackoffState = { retryCount: newRetryCount, nextAllowedAt, exhausted };
      statesRef.current.set(key, state);
      return state;
    },
    [maxRetries]
  );

  const isInFlight = useCallback((key: string) => inFlightRef.current.has(key), []);
  const markInFlight = useCallback((key: string) => {
    inFlightRef.current.add(key);
  }, []);
  const clearInFlight = useCallback((key: string) => {
    inFlightRef.current.delete(key);
  }, []);

  const shouldSkip = useCallback((key: string): boolean => {
    if (inFlightRef.current.has(key)) {
      return true;
    }
    const state = statesRef.current.get(key);
    if (!state) {
      return false;
    }
    if (state.exhausted) {
      return true;
    }
    if (Date.now() < state.nextAllowedAt) {
      return true;
    }
    return false;
  }, []);

  const cancelAll = useCallback(() => {
    timersRef.current.forEach(timerId => clearTimeout(timerId));
    timersRef.current.clear();
  }, []);

  // Memoize the returned object so that the reference is stable across renders.
  // Without this, every render produces a new object literal which, when the
  // BackoffContext is placed in a useEffect dependency array, tears down and
  // restarts the effect on every render (10–50ms cycle instead of the intended
  // 2 s polling interval).
  return useMemo(
    () => ({ getState, onSuccess, onError, isInFlight, markInFlight, clearInFlight, shouldSkip, cancelAll }),
    [getState, onSuccess, onError, isInFlight, markInFlight, clearInFlight, shouldSkip, cancelAll]
  );
}
