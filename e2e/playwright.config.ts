import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Global per-test timeout — prevents stuck tests from blocking CI indefinitely.
   * Individual tests that need a different limit override via test.setTimeout().
   * 120s gives headroom for login + navigation + assertions (regression suite
   * and search tests rely on this; do not lower without auditing all included specs). */
  timeout: 120000,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // In CI we use a fresh (ephemeral) browser context — no persistent
        // Chrome profile is available.  Locally, opt-in via CHROME_USER_DATA_DIR
        // or the default macOS path to reuse an existing login session.
        ...(process.env.CI
          ? {}
          : {
              contextOptions: {
                userDataDir:
                  process.env.CHROME_USER_DATA_DIR ||
                  path.join(
                    os.homedir(),
                    'Library/Application Support/Google/Chrome',
                  ),
              },
            }),
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            // Required in CI containers that run without /dev/shm
            ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
          ],
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // Commented out - assume server is already running
  // webServer: {
  //   command: 'cd client && npm start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});

