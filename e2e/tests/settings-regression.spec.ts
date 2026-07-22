/**
 * settings-regression.spec.ts — Settings page regression guards (Issue #664)
 *
 * Covers regressions from:
 *  - #654 — `index is not defined` in AutoResponderExclusionSettings
 *  - #663 — `m is not defined` in SchedulingPreferencesSection
 *
 * Routing notes (confirmed from client/src/App.tsx):
 *  - The only settings route is `/settings`. There is no `/settings/auto-responder`
 *    or `/settings/scheduling` sub-route.
 *  - Within the settings page, sections are anchor-scrolled via hash:
 *      `/settings#auto-responder`        → AutoResponderSection (id="auto-responder")
 *      `/settings#scheduling-preferences` → SchedulingPreferencesSection (id="scheduling-preferences")
 *
 * Strategy:
 *  - Register a `page.on('pageerror', ...)` listener BEFORE navigation so no
 *    JS error escapes capture (including errors thrown during initial render).
 *  - Navigate to each settings section and wait for the UI to settle.
 *  - Assert zero captured JS errors (full list) AND zero errors matching the
 *    specific regression patterns.
 *  - Assert the page body does not display a crash / error-boundary UI.
 *
 * Adding new guards:
 *  When a settings crash is fixed, add a new `test` block inside
 *  `Settings: regression guards` following the same pattern. Link the issue
 *  number in the test name so failures are immediately traceable.
 *
 * Runs against: PLAYWRIGHT_BASE_URL (defaults to https://dashboard.focusbear.io)
 */

import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

const QA_EMAIL    = process.env.TEST_EMAIL;
const QA_PASSWORD = process.env.TEST_PASSWORD;

if (!QA_EMAIL || !QA_PASSWORD) {
  throw new Error('TEST_EMAIL and TEST_PASSWORD must be set as environment variables');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsQA(page: Page): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto('/login');
  // LoginPage.login() lands on /inbox. Entering Triage is free in the guided flow
  // (no entry gate to overlay /inbox) before we navigate to /settings.
  await loginPage.login(QA_EMAIL, QA_PASSWORD);
}

/**
 * Navigate to `url`, collect any JS errors that fire during load + a settle
 * period, and return the collected error messages.
 */
async function navigateAndCollectErrors(
  page: Page,
  url: string,
  settleMs = 2_000,
): Promise<string[]> {
  const errors: string[] = [];
  // Attach listener BEFORE navigation so early-render errors are captured.
  const handler = (err: Error) => {
    console.error(`[pageerror] ${url} →`, err.message);
    errors.push(err.message);
  };
  page.on('pageerror', handler);

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  // Allow deferred renders and lazy-loaded sections to complete.
  await page.waitForTimeout(settleMs);

  page.off('pageerror', handler);
  return errors;
}

// ─── 1: Smoke — settings sections load ───────────────────────────────────────

test.describe('Settings: smoke — sections load without crash UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  test('settings root (/settings) loads without crash UI', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('ReferenceError');
    await expect(page.locator('body')).toBeVisible();
  });

  test('auto-responder section (/settings#auto-responder) loads without crash UI', async ({ page }) => {
    // The auto-responder section lives inside /settings at id="auto-responder".
    // There is no separate /settings/auto-responder route in the app.
    await page.goto('/settings#auto-responder');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('ReferenceError');
    await expect(page.locator('body')).toBeVisible();
  });

  test('scheduling preferences section renders in settings', async ({ page }) => {
    // SchedulingPreferencesSection renders inside /settings at id="scheduling-preferences".
    // The section heading text is "Scheduling Preferences" (from i18n en.json).
    await page.goto('/settings#scheduling-preferences');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);

    // The section heading is an <h2> containing the i18n key "Scheduling Preferences".
    const schedulingHeading = page
      .getByText(/scheduling preferences/i)
      .or(page.getByRole('heading', { name: /scheduling/i }))
      .first();

    // Assert heading is visible — regression of #663 caused the component to
    // throw before rendering, so heading visibility confirms successful render.
    await expect(schedulingHeading).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('ReferenceError');
  });
});

// ─── 2: Regression guards ────────────────────────────────────────────────────

test.describe('Settings: regression guards', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  // ── #654 ────────────────────────────────────────────────────────────────────

  test('#654 — auto-responder exclusion settings: no "index is not defined" and zero unhandled JS errors', async ({ page }) => {
    // Auto-responder section is at /settings#auto-responder (id="auto-responder").
    const errors = await navigateAndCollectErrors(page, '/settings#auto-responder');

    const regressionErrors = errors.filter(
      (e) =>
        e.includes('index is not defined') ||
        e.includes('ReferenceError: index'),
    );

    expect(
      regressionErrors,
      [
        'Regression of issue #654 detected.',
        '"index is not defined" ReferenceError was thrown while loading auto-responder settings.',
        `Captured errors: ${regressionErrors.join('; ')}`,
      ].join(' '),
    ).toHaveLength(0);

    // Also assert zero unhandled JS errors of any kind
    expect(
      errors,
      `Unexpected JS errors on /settings#auto-responder: ${errors.join('; ')}`,
    ).toHaveLength(0);

    // Secondary: no error-boundary crash screen
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('index is not defined');
  });

  // ── #663 ────────────────────────────────────────────────────────────────────

  test('#663 — "m is not defined" must not recur on scheduling preferences section', async ({ page }) => {
    // SchedulingPreferencesSection renders inside /settings at id="scheduling-preferences".
    const errors = await navigateAndCollectErrors(page, '/settings#scheduling-preferences');

    const regressionErrors = errors.filter(
      (e) =>
        e.includes('m is not defined') ||
        e.includes('ReferenceError: m'),
    );

    expect(
      regressionErrors,
      [
        'Regression of issue #663 detected.',
        '"m is not defined" ReferenceError was thrown while loading scheduling preferences.',
        `Captured errors: ${regressionErrors.join('; ')}`,
      ].join(' '),
    ).toHaveLength(0);

    // Secondary: no error-boundary crash screen
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('m is not defined');
  });

  test('#663 — scheduling preferences section renders visible content', async ({ page }) => {
    // Use navigateAndCollectErrors so the pageerror listener is attached
    // before navigation and torn down cleanly after the settle period.
    const errors = await navigateAndCollectErrors(page, '/settings#scheduling-preferences');

    // Assert the "Scheduling Preferences" heading is visible — regression of
    // #663 caused the component to throw before rendering anything meaningful.
    // Heading text comes from i18n key: settings.schedulingPreferences.title = "Scheduling Preferences".
    const schedulingHeading = page
      .getByText(/scheduling preferences/i)
      .or(page.getByRole('heading', { name: /scheduling/i }))
      .first();

    await expect(schedulingHeading).toBeVisible({ timeout: 10_000 });

    const mErrors = errors.filter((e) => e.includes('m is not defined') || e.includes('ReferenceError: m'));
    expect(
      mErrors,
      `Regression of #663: "m is not defined" errors: ${mErrors.join('; ')}`,
    ).toHaveLength(0);
  });

  // ── General rule: any settings page must be JS-error-free ───────────────────

  test('general — /settings root generates zero unhandled JS errors', async ({ page }) => {
    const errors = await navigateAndCollectErrors(page, '/settings');

    expect(
      errors,
      `Unexpected JS errors on /settings: ${errors.join('; ')}`,
    ).toHaveLength(0);
  });

  test('general — /settings does not render an error-boundary crash screen', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);

    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('ReferenceError');
    await expect(page.locator('body')).not.toContainText('TypeError');
    await expect(page.locator('body')).not.toContainText('is not defined');
  });
});

// ─── 3: Forward-compatibility contract ───────────────────────────────────────
//
// Per the requirement in #664: every new settings crash fix MUST ship with a
// regression guard test in this file. The test below serves as a template and
// documentation anchor.
//
// Routing reminder: all settings sections live at /settings (hash-scrolled):
//   /settings#auto-responder          → AutoResponderSection (id="auto-responder")
//   /settings#scheduling-preferences  → SchedulingPreferencesSection (id="scheduling-preferences")
//
// To add a new guard:
//
//   test('#NNN — "<variable> is not defined" must not recur on <section>', async ({ page }) => {
//     const errors = await navigateAndCollectErrors(page, '/settings#<section-anchor-id>');
//     const regressionErrors = errors.filter((e) => e.includes('<variable> is not defined'));
//     expect(regressionErrors, `Regression of #NNN: ${regressionErrors.join('; ')}`).toHaveLength(0);
//     await expect(page.locator('body')).not.toContainText('Something went wrong');
//   });
