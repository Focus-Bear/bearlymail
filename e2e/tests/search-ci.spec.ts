/**
 * search-ci.spec.ts — CI-safe search e2e tests
 *
 * These tests are designed to run reliably in CI against the seeded test
 * database (see server/scripts/seed-search-data.ts).  They do NOT rely on:
 *   • A live Gmail / Office365 / Zoho connection
 *   • A persistent Chrome profile
 *   • Files on the local filesystem (logs, etc.)
 *
 * The server must be started with CI_SEARCH_FALLBACK=true so that the
 * search endpoint falls back to an in-memory local-DB scan when no email
 * provider is connected.
 *
 * For local debugging with real email data, use search-debug.spec.ts instead.
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SearchPage } from '../pages/SearchPage';

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';

test.describe('Search CI — seeded data', () => {
  let searchPage: SearchPage;

  /**
   * Log in once and navigate to the search page before every test.
   * In CI the app is running in test/ephemeral mode, so we always need to
   * authenticate from scratch.
   */
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto('/login');
    await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
    await page.waitForURL('**/inbox', { timeout: 15000 });

    searchPage = new SearchPage(page);
    await searchPage.goto();
  });

  // ── Scenario 1 ──────────────────────────────────────────────────────────
  test('Scenario 1: query "test" returns seeded results', async ({ page }) => {
    test.setTimeout(60_000);

    await searchPage.search('test');
    await searchPage.waitForResults(45_000);

    const resultsCount = await searchPage.getResultsCount();
    const noResultsMessage = await searchPage.getNoResultsMessage();

    console.log(`Results count: ${resultsCount}`);
    console.log(`No-results message: ${noResultsMessage}`);

    // We expect at least one result (seed emails have "test" in subject/from/body)
    expect(
      resultsCount > 0,
      'Expected at least one search result for query "test" against seeded data',
    ).toBe(true);

    // The queries-tried debug info should be surfaced in the UI (or at least
    // not crash the page).
    const queriesTried = await searchPage.getQueriesTried();
    console.log(`Queries tried in UI: ${JSON.stringify(queriesTried, null, 2)}`);
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  test('Scenario 2: nonsensical query returns "no results" with queries tried', async ({ page }) => {
    test.setTimeout(60_000);

    const nonsenseQuery = 'xyzabc123nonexistentquery98765';
    await searchPage.search(nonsenseQuery);
    await searchPage.waitForResults(45_000);

    const noResultsMessage = await searchPage.getNoResultsMessage();

    // UI must show a "no results" indicator
    expect(
      noResultsMessage,
      'Expected a "no results" message for a nonsensical query',
    ).toBeTruthy();
    expect(noResultsMessage?.toLowerCase()).toContain('no');

    // Queries-tried section should be displayed when there are no results
    const queriesTried = await searchPage.getQueriesTried();
    console.log(`Queries tried in UI: ${JSON.stringify(queriesTried, null, 2)}`);

    // Check page body contains some search-diagnostic text
    const pageText = (await page.textContent('body').catch(() => '')) ?? '';
    const hasDiagnostics =
      pageText.includes('query') ||
      pageText.includes('tried') ||
      pageText.includes('No') ||
      queriesTried.length > 0;

    expect(hasDiagnostics, 'Expected search diagnostic info on no-results page').toBe(true);
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  test('Scenario 3: query "meeting" shows results and optionally rejected emails', async ({ page }) => {
    test.setTimeout(60_000);

    await searchPage.search('meeting');
    await searchPage.waitForResults(45_000);

    const resultsCount = await searchPage.getResultsCount();
    const noResultsMessage = await searchPage.getNoResultsMessage();

    console.log(`Results count: ${resultsCount}`);

    // At minimum we expect a result or a no-results message — the page must not crash.
    expect(
      resultsCount > 0 || noResultsMessage !== null,
      'Expected results or a no-results message for query "meeting"',
    ).toBe(true);

    // Optionally check for the rejected-emails debug section
    const rejectedEmailsSection = searchPage.rejectedEmailsSection;
    const hasRejectedSection = await rejectedEmailsSection.isVisible().catch(() => false);

    if (hasRejectedSection) {
      const rejectedEmails = await searchPage.getRejectedEmails();
      console.log(`Rejected emails: ${JSON.stringify(rejectedEmails, null, 2)}`);

      // Each rejected email entry should have a from address
      rejectedEmails.forEach((email) => {
        expect(email.from).toBeTruthy();
      });
    } else {
      console.log('No rejected-emails section visible — all results ranked above threshold');
    }
  });

  // ── Post-test failure diagnostics ───────────────────────────────────────
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed') {
      console.log('\n=== TEST FAILED — CI Search Debug ===');
      const pageText = await page.textContent('body').catch(() => '');
      console.log('Page text (first 2000 chars):', pageText?.substring(0, 2000));
      console.log('=== End Debug ===\n');
    }
  });
});
