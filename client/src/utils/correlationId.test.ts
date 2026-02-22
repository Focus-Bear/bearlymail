import { generateCorrelationId, isNetworkError } from './correlationId';

describe('generateCorrelationId', () => {
  it('returns a string of exactly 5 characters', () => {
    const id = generateCorrelationId();
    expect(id).toHaveLength(5);
  });

  it('contains only uppercase letters and digits', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[A-Z0-9]{5}$/);
    }
  });

  it('generates different IDs on successive calls (with very high probability)', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCorrelationId()));
    // With 36^5 = 60,466,176 possible IDs, 50 calls should almost never collide
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('isNetworkError', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('returns true when navigator.onLine is false', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    });
    const error = new Error('Some unrelated error');
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns false for a generic error when online', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('Something broke in the component');
    expect(isNetworkError(error)).toBe(false);
  });

  it('returns true for "Network Error" message (axios offline error)', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('Network Error');
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns true for "Failed to fetch" message', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('Failed to fetch');
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns true for "net::ERR_..." chrome-style messages', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('net::ERR_CONNECTION_RESET');
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns true for "Load failed" (Safari network error)', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('Load failed');
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns true for "ERR_NETWORK" code in the message', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error('ERR_NETWORK');
    expect(isNetworkError(error)).toBe(true);
  });

  it('handles an error with no message gracefully', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    const error = new Error();
    expect(isNetworkError(error)).toBe(false);
  });
});
