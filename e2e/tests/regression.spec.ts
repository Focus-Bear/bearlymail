/**
 * regression.spec.ts — Regression test suite (Issue #656)
 *
 * Covers:
 *  1. Smoke tests  — all main pages load without crashing
 *  2. Critical flows — login, email list, open email, tab switching, leaderboard
 *  3. Regression guards — specific past bugs (#650 STRING_NONE, #654 index is not defined)
 *
 * QA seed user is pre-seeded with emails across multiple categories.
 * Runs against the app URL set by PLAYWRIGHT_BASE_URL (defaults to
 * https://dashboard.focusbear.io).
 */

import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

const QA_EMAIL    = process.env.TEST_EMAIL    || 'internaltest+openclaw_qa@focusbear.io';
const QA_PASSWORD = process.env.TEST_PASSWORD || 'TestFocusBear2024!';

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function loginAsQA(page: Page): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto('/login');
  await loginPage.login(QA_EMAIL, QA_PASSWORD);
  // LoginPage.login already waits for /inbox navigation
}

// ─── 1: Smoke tests ──────────────────────────────────────────────────────────

test.describe('Smoke: pages load without crash', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  test('inbox loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/inbox/);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).toBeVisible();
  });

  test('stats page loads', async ({ page }) => {
    await page.goto('/stats');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('auto-responder settings page loads without crash', async ({ page }) => {
    await page.goto('/settings/auto-responder');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('ReferenceError');
  });
});

// ─── 2: Critical flows ───────────────────────────────────────────────────────

test.describe('Critical flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  test('login: valid credentials navigate to inbox', async ({ page }) => {
    // loginAsQA asserts navigation — this documents the happy-path contract
    await expect(page).toHaveURL(/\/inbox/);
  });

  test('inbox: email list renders', async ({ page }) => {
    // QA account is pre-seeded — at least one email row must be visible
    const emailRows = page.locator('[data-testid="email-row"], [role="listitem"]');
    await expect(emailRows.first()).toBeVisible({ timeout: 15_000 });
  });

  test('inbox: can open an email', async ({ page }) => {
    const firstEmail = page
      .locator('[data-testid="email-row"], [role="listitem"]')
      .first();
    await firstEmail.click();
    // Email detail panel should appear
    await expect(
      page.locator('[data-testid="email-detail"], [role="main"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('inbox: can switch between Triage and Follow-up tabs', async ({ page }) => {
    const triageTab = page
      .getByRole('tab', { name: /triage/i })
      .or(page.getByText(/triage/i).first());
    const followUpTab = page
      .getByRole('tab', { name: /follow.?up/i })
      .or(page.getByText(/follow.?up/i).first());

    await triageTab.click();
    await expect(page.locator('body')).not.toContainText('Something went wrong');

    await followUpTab.click();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('stats: leaderboard tab loads', async ({ page }) => {
    await page.goto('/stats');
    await page.waitForLoadState('domcontentloaded');
    const leaderboardTab = page
      .getByRole('tab', { name: /leaderboard/i })
      .or(page.getByText(/leaderboard/i).first());
    if (await leaderboardTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await leaderboardTab.click();
    }
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('settings: auto-responder exclusion section renders', async ({ page }) => {
    await page.goto('/settings/auto-responder');
    await page.waitForLoadState('domcontentloaded');
    const exclusionSection = page.getByText(/exclusion/i).first();
    await expect(exclusionSection).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 3: Regression guards ────────────────────────────────────────────────────

test.describe('Regression guards', () => {
  let jsErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    jsErrors = [];
    page.on('pageerror', (err) => {
      console.error('[pageerror]', err.message);
      jsErrors.push(err.message);
    });
    await loginAsQA(page);
  });

  test('#650 — STRING_NONE: inbox loads without STRING_NONE JS error', async ({ page }) => {
    await expect(page).toHaveURL(/\/inbox/);
    // Let React settle and any deferred renders complete
    await page.waitForTimeout(2_000);

    const stringNoneErrors = jsErrors.filter((e) => e.includes('STRING_NONE'));
    expect(
      stringNoneErrors,
      `Detected STRING_NONE JS errors — regression of issue #650: ${stringNoneErrors.join('; ')}`,
    ).toHaveLength(0);

    // Also assert inbox content is present (no crash screen)
    await expect(page.locator('body')).not.toContainText('STRING_NONE');
  });

  test('#654 — index is not defined: auto-responder settings renders without ReferenceError', async ({ page }) => {
    await page.goto('/settings/auto-responder');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);

    const indexErrors = jsErrors.filter(
      (e) => e.includes('index is not defined') || e.includes('ReferenceError: index'),
    );
    expect(
      indexErrors,
      `Detected "index is not defined" JS errors — regression of issue #654: ${indexErrors.join('; ')}`,
    ).toHaveLength(0);

    // Page must not show crash UI
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('index is not defined');
  });
});
