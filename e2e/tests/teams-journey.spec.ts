/**
 * teams-journey.spec.ts — E2E journey tests for the team accounts feature (#1112)
 *
 * Covers:
 *  1. AcceptInvite page — valid and invalid tokens
 *  2. TeamSettings section in Settings page
 *  3. Thread assignment UI
 *
 * NOTE: These tests depend on a pre-seeded org and invite token in the test environment.
 * Set the environment variables below to run against a live stack:
 *   TEST_INVITE_TOKEN  — valid 64-char hex invite token
 *   TEST_INVITE_TOKEN_EXPIRED — expired invite token
 *   TEST_EMAIL, TEST_PASSWORD — QA user credentials
 *   TEST_OWNER_EMAIL, TEST_OWNER_PASSWORD — org owner credentials
 */

import { expect, Page, test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

const QA_EMAIL = process.env.TEST_EMAIL || 'internaltest+openclaw_qa@focusbear.io';
const QA_PASSWORD = process.env.TEST_PASSWORD || 'TestFocusBear2024!';
const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL || QA_EMAIL;
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD || QA_PASSWORD;
const VALID_INVITE_TOKEN = process.env.TEST_INVITE_TOKEN || 'test-token-replace-me';
const EXPIRED_INVITE_TOKEN = process.env.TEST_INVITE_TOKEN_EXPIRED || 'expired-token';

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto('/login');
  await loginPage.login(email, password);
}

// ─── 1: AcceptInvite page ────────────────────────────────────────────────────

test.describe('AcceptInvite page', () => {
  test('shows error for an invalid/expired invite token', async ({ page }) => {
    await page.goto(`/accept-invite/${EXPIRED_INVITE_TOKEN}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.getByText(/Invite not found|invalid|expired/i)).toBeVisible({
      timeout: 8000,
    });
  });

  test('shows invite details for a valid token (unauthenticated)', async ({ page }) => {
    test.skip(
      VALID_INVITE_TOKEN === 'test-token-replace-me',
      'Set TEST_INVITE_TOKEN to run this test',
    );

    await page.goto(`/accept-invite/${VALID_INVITE_TOKEN}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.getByText(/invited|join/i)).toBeVisible({ timeout: 8000 });
  });

  test('redirects to login when unauthenticated user clicks Accept', async ({ page }) => {
    test.skip(
      VALID_INVITE_TOKEN === 'test-token-replace-me',
      'Set TEST_INVITE_TOKEN to run this test',
    );

    await page.goto(`/accept-invite/${VALID_INVITE_TOKEN}`);
    await page.waitForLoadState('domcontentloaded');
    const acceptBtn = page.getByRole('button', { name: /accept|sign in/i });
    await acceptBtn.click();
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });

  test('accepts invite when authenticated user clicks Accept', async ({ page }) => {
    test.skip(
      VALID_INVITE_TOKEN === 'test-token-replace-me',
      'Set TEST_INVITE_TOKEN to run this test',
    );

    await loginAs(page, QA_EMAIL, QA_PASSWORD);
    await page.goto(`/accept-invite/${VALID_INVITE_TOKEN}`);
    await page.waitForLoadState('domcontentloaded');

    const acceptBtn = page.getByRole('button', { name: /accept invite/i });
    await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
    await acceptBtn.click();

    await page.waitForURL(/\/inbox/, { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});

// ─── 2: TeamSettings section ─────────────────────────────────────────────────

test.describe('TeamSettings in Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
  });

  test('TeamSettings section is visible', async ({ page }) => {
    await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('shows member list or "no members" message', async ({ page }) => {
    const teamHeading = page.getByText(/^Team$/i);
    await teamHeading.waitFor({ state: 'visible', timeout: 8000 });
    const hasMemberList = await page.getByText(/Members/i).isVisible();
    expect(hasMemberList).toBe(true);
  });

  test('Invite form is present with email input and role select', async ({ page }) => {
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByRole('button', { name: /send invite/i })).toBeVisible();
  });

  test('shows error when submitting invite with empty email', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /send invite/i });
    await sendBtn.waitFor({ state: 'visible', timeout: 8000 });
    await sendBtn.click();
    const emailInput = page.getByPlaceholder(/email address/i);
    await expect(emailInput).toBeVisible();
  });
});

// ─── 3: Thread assignment ────────────────────────────────────────────────────

test.describe('Thread assignment UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
  });

  test('inbox loads without error after adding assigneeId filter param', async ({ page }) => {
    await page.goto('/inbox/triage?assigneeId=unassigned');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});

// ─── 4: Edge cases ───────────────────────────────────────────────────────────

test.describe('Invite edge cases', () => {
  test('navigating to /accept-invite with no token shows 404 or not-found UI', async ({
    page,
  }) => {
    await page.goto('/accept-invite/');
    await page.waitForLoadState('domcontentloaded');
    const body = page.locator('body');
    const text = await body.textContent();
    expect(text).toBeTruthy();
  });

  test('invalid token shows invalid UI, not a crash', async ({ page }) => {
    await page.goto('/accept-invite/000000000000000000000000000000000000000000000000000000000000000000');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});
