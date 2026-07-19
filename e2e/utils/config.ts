/**
 * Shared E2E configuration constants.
 * Single source of truth for API base URL and test credentials.
 */

/** Server base URL for Playwright request API (static client on :3000 does not proxy /emails). */
export const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  'http://localhost:3001';

export const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
export const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
