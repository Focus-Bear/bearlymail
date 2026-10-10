import 'vitest';

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 assertions carry both the matcher return type and received value.
// Extend Matchers so synchronous, async, and asymmetric assertions share DOM types.
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
