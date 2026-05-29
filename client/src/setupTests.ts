// jest-dom adds custom matchers for asserting on DOM nodes, e.g.
// expect(element).toHaveTextContent(/react/i)
// https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Testing Library's `waitFor` pumps fake timers itself, but only when it detects
// a Jest-style fake-timer environment: it requires a global `jest` object AND a
// faked `setTimeout` carrying a `clock` property. Vitest's fake timers provide
// the `clock` marker but no global `jest`, so without this shim `waitFor` hangs
// until the 5s timeout whenever a test calls `vi.useFakeTimers()`. Exposing
// `jest.advanceTimersByTime` (the only method waitFor uses) restores the
// behaviour the suite was written against under Create React App's Jest setup.
(globalThis as typeof globalThis & { jest?: { advanceTimersByTime(ms: number): void } }).jest = {
  advanceTimersByTime: (ms: number) => {
    vi.advanceTimersByTime(ms);
  },
};

// Unmount React trees between tests so DOM state doesn't leak across cases.
afterEach(() => {
  cleanup();
});
