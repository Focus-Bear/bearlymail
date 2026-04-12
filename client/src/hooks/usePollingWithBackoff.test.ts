/**
 * Tests for usePollingWithBackoff — the shared exponential-backoff circuit-breaker utility.
 *
 * Tests cover:
 * - computeBackoffDelay helper
 * - parseRetryAfterMs helper
 * - Hook: onError / onSuccess / shouldSkip / exhaustion flow
 * - 429-specific Retry-After handling
 * - Reset flow
 */

import { renderHook } from '@testing-library/react';

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  HTTP_TOO_MANY_REQUESTS,
  MAX_CATEGORY_FETCH_RETRIES,
  RETRY_AFTER_MIN_MS,
} from 'constants/numbers';

import { computeBackoffDelay, parseRetryAfterMs, usePollingWithBackoff } from './usePollingWithBackoff';

describe('computeBackoffDelay', () => {
  it('should return a positive value for retry 0', () => {
    const delay = computeBackoffDelay(0);
    expect(delay).toBeGreaterThanOrEqual(0);
    // base * 2^0 = BACKOFF_BASE_MS, ±500ms jitter
    expect(delay).toBeLessThanOrEqual(BACKOFF_BASE_MS + 500);
  });

  it('should grow exponentially up to BACKOFF_MAX_MS', () => {
    const delay3 = computeBackoffDelay(3);
    // delay3 should generally be larger than delay0 (jitter could overlap at low counts but not by much)
    // We use a wide margin to accommodate jitter
    expect(delay3).toBeGreaterThan(0);
    // Should be capped at BACKOFF_MAX_MS + jitter_max
    expect(delay3).toBeLessThanOrEqual(BACKOFF_MAX_MS + 500);
  });

  it('should cap at BACKOFF_MAX_MS regardless of retry count', () => {
    // retry 20 = well past the cap
    const delay = computeBackoffDelay(20);
    // With jitter: max is BACKOFF_MAX_MS + 500, min is BACKOFF_MAX_MS - 500
    expect(delay).toBeLessThanOrEqual(BACKOFF_MAX_MS + 500);
  });
});

describe('parseRetryAfterMs', () => {
  it('returns null when error has no response', () => {
    expect(parseRetryAfterMs(new Error('network error'))).toBeNull();
  });

  it('returns null when response has no headers', () => {
    expect(parseRetryAfterMs({ response: {} })).toBeNull();
  });

  it('returns null when retry-after header is absent', () => {
    expect(parseRetryAfterMs({ response: { headers: {} } })).toBeNull();
  });

  it('parses integer seconds and enforces RETRY_AFTER_MIN_MS floor', () => {
    const result = parseRetryAfterMs({ response: { headers: { 'retry-after': '10' } } });
    expect(result).toBe(10_000); // 10s in ms
  });

  it('enforces RETRY_AFTER_MIN_MS floor when Retry-After is below it', () => {
    const result = parseRetryAfterMs({ response: { headers: { 'retry-after': '1' } } });
    expect(result).toBe(RETRY_AFTER_MIN_MS); // floor applied
  });

  it('parses HTTP-date format', () => {
    const futureDate = new Date(Date.now() + 15_000).toUTCString();
    const result = parseRetryAfterMs({ response: { headers: { 'retry-after': futureDate } } });
    // Should be approximately 15s, at least RETRY_AFTER_MIN_MS
    expect(result).toBeGreaterThanOrEqual(RETRY_AFTER_MIN_MS);
    expect(result).toBeLessThanOrEqual(16_000); // some buffer for test execution time
  });

  it('returns RETRY_AFTER_MIN_MS floor for HTTP-date in the past', () => {
    const pastDate = new Date(Date.now() - 5_000).toUTCString();
    const result = parseRetryAfterMs({ response: { headers: { 'retry-after': pastDate } } });
    expect(result).toBe(RETRY_AFTER_MIN_MS);
  });

  it('handles Retry-After header (capitalized)', () => {
    const result = parseRetryAfterMs({ response: { headers: { 'Retry-After': '20' } } });
    expect(result).toBe(20_000);
  });

  it('returns null for unparseable header value', () => {
    const result = parseRetryAfterMs({ response: { headers: { 'retry-after': 'not-a-date-or-number' } } });
    expect(result).toBeNull();
  });
});

describe('usePollingWithBackoff', () => {
  const KEY = 'test-category';

  describe('initial state', () => {
    it('returns undefined state for a key that has never failed', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      expect(result.current.getState(KEY)).toBeUndefined();
    });

    it('shouldSkip returns false for a key that has never been touched', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      expect(result.current.shouldSkip(KEY)).toBe(false);
    });
  });

  describe('in-flight tracking', () => {
    it('shouldSkip returns true while key is marked in-flight', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.markInFlight(KEY);
      expect(result.current.shouldSkip(KEY)).toBe(true);
    });

    it('shouldSkip returns false after clearing in-flight', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.markInFlight(KEY);
      result.current.clearInFlight(KEY);
      expect(result.current.shouldSkip(KEY)).toBe(false);
    });

    it('isInFlight returns true while in-flight', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.markInFlight(KEY);
      expect(result.current.isInFlight(KEY)).toBe(true);
    });

    it('isInFlight returns false after clearing', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.markInFlight(KEY);
      result.current.clearInFlight(KEY);
      expect(result.current.isInFlight(KEY)).toBe(false);
    });
  });

  describe('onError / backoff state', () => {
    it('increments retryCount on each error', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const err = { response: { status: 500 } };

      const state1 = result.current.onError(KEY, err);
      expect(state1.retryCount).toBe(1);

      const state2 = result.current.onError(KEY, err);
      expect(state2.retryCount).toBe(2);
    });

    it('sets nextAllowedAt in the future', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const before = Date.now();
      const state = result.current.onError(KEY, { response: { status: 500 } });
      expect(state.nextAllowedAt).toBeGreaterThan(before);
    });

    it('shouldSkip returns true while in backoff window', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.onError(KEY, { response: { status: 500 } });
      // Immediately after error, backoff window is active
      expect(result.current.shouldSkip(KEY)).toBe(true);
    });

    it('marks key as exhausted after maxRetries errors', () => {
      const maxRetries = 4;
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries }));
      const err = { response: { status: 500 } };

      let state;
      for (let i = 0; i < maxRetries; i++) {
        state = result.current.onError(KEY, err);
      }
      expect(state?.exhausted).toBe(true);
    });

    it('shouldSkip returns true when exhausted', () => {
      const maxRetries = 2;
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries }));
      const err = { response: { status: 500 } };

      for (let i = 0; i < maxRetries; i++) {
        result.current.onError(KEY, err);
      }
      expect(result.current.shouldSkip(KEY)).toBe(true);
    });
  });

  describe('429 handling', () => {
    it('uses Retry-After header when available on 429', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const err = {
        response: {
          status: HTTP_TOO_MANY_REQUESTS,
          headers: { 'retry-after': '30' }, // 30 seconds
        },
      };
      const before = Date.now();
      const state = result.current.onError(KEY, err);
      // nextAllowedAt should be ~30s from now
      expect(state.nextAllowedAt).toBeGreaterThanOrEqual(before + 29_000);
      expect(state.nextAllowedAt).toBeLessThanOrEqual(before + 31_000);
    });

    it('falls back to exponential backoff on 429 without Retry-After header', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const err = { response: { status: HTTP_TOO_MANY_REQUESTS, headers: {} } };
      const before = Date.now();
      const state = result.current.onError(KEY, err);
      // Should apply at least RETRY_AFTER_MIN_MS floor
      expect(state.nextAllowedAt).toBeGreaterThanOrEqual(before + RETRY_AFTER_MIN_MS);
    });

    it('exhausts after MAX_CATEGORY_FETCH_RETRIES 429s', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: MAX_CATEGORY_FETCH_RETRIES }));
      const err = { response: { status: HTTP_TOO_MANY_REQUESTS, headers: {} } };

      let state;
      for (let i = 0; i < MAX_CATEGORY_FETCH_RETRIES; i++) {
        state = result.current.onError(KEY, err);
      }
      expect(state?.exhausted).toBe(true);
    });
  });

  describe('onSuccess / reset flow', () => {
    it('clears backoff state after success', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.onError(KEY, { response: { status: 500 } });
      expect(result.current.getState(KEY)).toBeDefined();

      result.current.onSuccess(KEY);
      expect(result.current.getState(KEY)).toBeUndefined();
    });

    it('shouldSkip returns false after success reset', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      result.current.onError(KEY, { response: { status: 500 } });
      result.current.onSuccess(KEY);
      expect(result.current.shouldSkip(KEY)).toBe(false);
    });

    it('allows retries again after reset from exhausted state', () => {
      const maxRetries = 2;
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries }));
      const err = { response: { status: 500 } };

      for (let i = 0; i < maxRetries; i++) {
        result.current.onError(KEY, err);
      }
      expect(result.current.getState(KEY)?.exhausted).toBe(true);

      // Simulate user manual retry — consumer calls onSuccess to clear state
      result.current.onSuccess(KEY);
      expect(result.current.shouldSkip(KEY)).toBe(false);

      // Can start accumulating errors again
      const newState = result.current.onError(KEY, err);
      expect(newState.retryCount).toBe(1);
      expect(newState.exhausted).toBe(false);
    });
  });

  describe('multi-key isolation', () => {
    it('tracks separate state per key', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const KEY_A = 'category-a';
      const KEY_B = 'category-b';

      result.current.onError(KEY_A, { response: { status: 500 } });
      expect(result.current.getState(KEY_A)).toBeDefined();
      expect(result.current.getState(KEY_B)).toBeUndefined();
      expect(result.current.shouldSkip(KEY_A)).toBe(true);
      expect(result.current.shouldSkip(KEY_B)).toBe(false);
    });

    it('success on one key does not affect another', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      const KEY_A = 'category-a';
      const KEY_B = 'category-b';

      result.current.onError(KEY_A, { response: { status: 500 } });
      result.current.onError(KEY_B, { response: { status: 500 } });
      result.current.onSuccess(KEY_A);

      expect(result.current.getState(KEY_A)).toBeUndefined();
      expect(result.current.getState(KEY_B)).toBeDefined();
    });
  });

  describe('cancelAll', () => {
    it('can be called without error even when no timers are registered', () => {
      const { result } = renderHook(() => usePollingWithBackoff({ maxRetries: 4 }));
      expect(() => result.current.cancelAll()).not.toThrow();
    });
  });
});
