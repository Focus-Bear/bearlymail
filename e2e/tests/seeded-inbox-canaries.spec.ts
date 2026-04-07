/**
 * Seeded canary threads (test@example.com) — subjects must match server/scripts/seed-test-user.ts
 * Priority explanation shape must match PRIORITY_EXPLANATION in that script (thread create payload).
 *
 * These tests verify:
 * 1. Seeded canary emails appear in the correct inbox tab (triage/action/follow-up)
 * 2. The priority-explanation API returns a valid, non-empty breakdown for seeded data
 * 3. The priority tooltip is visible and renders correct breakdown content
 */
import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InboxPage } from '../pages/InboxPage';
import { API_BASE, TEST_EMAIL, TEST_PASSWORD } from '../utils/config';

/**
 * Canary subjects — MUST match server/scripts/seed-test-user.ts SEED_EMAILS.
 * The follow-up canary's latest email has a "Re:" prefix; we match by substring.
 */
const E2E_CANARY_SUBJECTS = {
  triage: '[E2E Canary] Triage visibility',
  action: '[E2E Canary] Action visibility',
  followUp: '[E2E Canary] Follow-up visibility',
} as const;

async function authHeader(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchInboxEmails(
  page: Page,
  mode: 'triage' | 'action' | 'follow-up',
): Promise<{ id: string; subject: string }[]> {
  const headers = await authHeader(page);
  // limit=200: large enough to cover all seeded canary threads (actual inbox has ~20 items in CI)
  const FETCH_LIMIT = 200;
  const res = await page.request.get(
    `${API_BASE}/emails/inbox?mode=${encodeURIComponent(mode)}&limit=${FETCH_LIMIT}&offset=0`,
    { headers },
  );
  expect(res.ok(), `GET /emails/inbox mode=${mode} → HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const emails = body?.emails;
  expect(Array.isArray(emails), 'inbox response should include emails[]').toBe(true);
  return emails.map((e: { id: string; subject?: string }) => ({
    id: e.id,
    subject: e.subject ?? '',
  }));
}

test.describe.skip('Seeded inbox canaries', () => {
  // Skipped until seeded-inbox infrastructure is wired into CI.
  // Remove the .skip to enable when ready.

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto('/login');
    await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
  });

  // ── Tab visibility tests ─────────────────────────────────────────────────

  test('triage inbox lists triage canary subject', async ({ page }) => {
    test.setTimeout(45_000); // login + navigation + inbox load + API call
    await page.goto('/inbox/triage');
    const inboxPage = new InboxPage(page);
    await inboxPage.waitForInboxToLoad(20_000);

    // API-level assertion: the canary email must be in the triage response
    const rows = await fetchInboxEmails(page, 'triage');
    const triageCanary = rows.find((r) => r.subject.includes(E2E_CANARY_SUBJECTS.triage));
    expect(
      triageCanary,
      `Triage canary "${E2E_CANARY_SUBJECTS.triage}" not found in ${rows.length} triage rows. ` +
        `Subjects: ${rows.map((r) => r.subject).join(' | ')}`,
    ).toBeDefined();

    // UI-level assertion omitted: the inbox uses a virtualised list and the canary
    // may be below the visible fold. The API-level assertion above is sufficient.
  });

  test('action inbox lists action canary subject', async ({ page }) => {
    test.setTimeout(45_000); // login + navigation + inbox load + API call
    await page.goto('/inbox/action');
    const inboxPage = new InboxPage(page);
    await inboxPage.waitForInboxToLoad(20_000);

    // API-level assertion
    const rows = await fetchInboxEmails(page, 'action');
    const actionCanary = rows.find((r) => r.subject.includes(E2E_CANARY_SUBJECTS.action));
    expect(
      actionCanary,
      `Action canary "${E2E_CANARY_SUBJECTS.action}" not found in ${rows.length} action rows. ` +
        `Subjects: ${rows.map((r) => r.subject).join(' | ')}`,
    ).toBeDefined();

    // UI-level assertion
    await expect(
      page.getByText(E2E_CANARY_SUBJECTS.action),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('follow-up inbox lists follow-up canary (user sent last)', async ({ page }) => {
    test.setTimeout(45_000); // login + navigation + inbox load + API call
    await page.goto('/inbox/follow-up');
    const inboxPage = new InboxPage(page);
    await inboxPage.waitForInboxToLoad(20_000);

    // API-level assertion — the follow-up thread subject contains the canary marker
    const rows = await fetchInboxEmails(page, 'follow-up');
    const followUpCanary = rows.find((r) => r.subject.includes(E2E_CANARY_SUBJECTS.followUp));
    expect(
      followUpCanary,
      `Follow-up canary "${E2E_CANARY_SUBJECTS.followUp}" not found in ${rows.length} follow-up rows. ` +
        `Subjects: ${rows.map((r) => r.subject).join(' | ')}`,
    ).toBeDefined();
    // Note: no UI-level toBeVisible assertion here — the follow-up list is virtualised
    // and the canary row may be below the viewport. API-only assertion is sufficient.
  });

  // ── Priority explanation test ─────────────────────────────────────────────

  test('priority-explanation API returns valid breakdown for triage canary', async ({
    page,
  }) => {
    test.setTimeout(45_000); // login + navigation + inbox load + priority API call
    await page.goto('/inbox/triage');
    const inboxPage = new InboxPage(page);
    await inboxPage.waitForInboxToLoad(20_000);

    // Find the canary email via API
    const rows = await fetchInboxEmails(page, 'triage');
    const canary = rows.find((r) => r.subject.includes(E2E_CANARY_SUBJECTS.triage));
    expect(canary, `triage canary email not found among ${rows.length} rows`).toBeDefined();
    if (!canary) return; // TypeScript narrowing

    // Fetch priority explanation
    const headers = await authHeader(page);
    const explRes = await page.request.get(
      `${API_BASE}/emails/${canary.id}/priority-explanation`,
      { headers },
    );
    expect(
      explRes.ok(),
      `priority-explanation HTTP ${explRes.status()} — body: ${(await explRes.text()).slice(0, 500)}`,
    ).toBeTruthy();

    const data = await explRes.json();
    console.log(`Priority explanation response: ${JSON.stringify(data).slice(0, 500)}`);

    // Score must be >= 0. In CI there is no LLM so the endpoint may compute on-demand
    // and return score=0; we accept that here — the important guard is that the API
    // returns a valid shape with a non-empty breakdown (checked below).
    expect(data.score, 'priority score must be a number').toBeGreaterThanOrEqual(0);
    expect(data.score, 'priority score must be ≤ 100').toBeLessThanOrEqual(100);

    // Dimensions must exist and have score fields
    expect(data.dimensions, 'dimensions must be present').toBeDefined();
    expect(data.dimensions.urgency, 'urgency dimension must be present').toBeDefined();
    expect(data.dimensions.goalAlignment, 'goalAlignment dimension must be present').toBeDefined();
    expect(data.dimensions.vipContact, 'vipContact dimension must be present').toBeDefined();
    expect(data.dimensions.sentiment, 'sentiment dimension must be present').toBeDefined();

    // Breakdown must not be empty (regression guard: empty breakdown = tooltip renders nothing)
    const breakdown = data.breakdown as { factor?: string; value?: number }[] | undefined;
    expect(breakdown, 'breakdown must be present').toBeDefined();
    expect(breakdown?.length, 'breakdown must not be empty').toBeGreaterThan(0);

    // At least one breakdown factor must match the expected emoji-prefixed format
    const factors = (breakdown ?? []).map((b) => b.factor ?? '');
    const expectedFactorPatterns = ['⭐ VIP Contact', '🎯 Goal Alignment', '🔥 Urgency', '😊 Sentiment'];
    const matchedFactors = expectedFactorPatterns.filter((p) =>
      factors.some((f) => f.includes(p)),
    );
    expect(
      matchedFactors.length,
      `Expected at least one of ${expectedFactorPatterns.join(', ')} in breakdown factors: ${JSON.stringify(factors)}`,
    ).toBeGreaterThan(0);

    // Regression guard: seeded data must NOT be overwritten with "Calculating..." fallback.
    // If computeFallbackExplanation runs instead of returning stored data, breakdown items
    // will have description "Calculating..." and the score will be 0.
    const breakdownDescs = (breakdown ?? []).map(
      (b: { description?: string }) => b.description ?? '',
    );
    const hasCalculating = breakdownDescs.some((d: string) => d.includes('Calculating...'));
    expect(
      hasCalculating,
      `Breakdown contains "Calculating..." descriptions — fallback overwrote seeded data. ` +
        `Descriptions: ${JSON.stringify(breakdownDescs)}`,
    ).toBe(false);

    // Seeded canary must return the stored score (80), not a recomputed fallback score of 0
    expect(
      data.score,
      `Expected seeded priority score > 0 but got ${data.score} — fallback may have overwritten stored data`,
    ).toBeGreaterThan(0);
  });
});
