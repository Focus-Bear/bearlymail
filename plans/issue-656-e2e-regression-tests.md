# Plan: e2e Regression Test Suite (Issue #656)

## Goal

Establish a Playwright test suite in the existing `e2e/` directory that:

1. Verifies all critical app paths load without crashing
2. Guards against known regressions (#650 `STRING_NONE`, #654 `index is not defined`)
3. Runs automatically in CI on every PR

---

## Existing Infrastructure

The `e2e/` directory already contains:

| Asset                           | Notes                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `playwright.config.ts`          | Configured for `https://dashboard.focusbear.io`, retries on CI, Chromium only |
| `pages/LoginPage.ts`            | Full login + register flow with API response detection                        |
| `pages/InboxPage.ts`            | Inbox load detection helpers                                                  |
| `pages/BasePage.ts`             | Base page class                                                               |
| `pages/SearchPage.ts`           | Search page helpers                                                           |
| `utils/NetworkTracker.ts`       | Network request tracking utility                                              |
| `tests/inbox-load-time.spec.ts` | Performance spec (existing)                                                   |
| `tests/search-ci.spec.ts`       | Search spec (existing)                                                        |

**QA seed user** (from #651 / `plans/issue-651-qa-test-environment.md`):

- Email: `internaltest+openclaw_qa@focusbear.io`
- Password: `TestFocusBear2024!`
- Pre-seeded with emails across multiple categories

---

## New Test File: `e2e/tests/regression.spec.ts`

Single spec file with clearly named `describe` blocks covering all required areas.

### File structure

```ts
import { test, expect, Page } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

const QA_EMAIL = "internaltest+openclaw_qa@focusbear.io";
const QA_PASSWORD = "TestFocusBear2024!";
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || "https://dashboard.focusbear.io";

// ─── Auth helper ────────────────────────────────────────────────────────────

async function loginAsQA(page: Page): Promise<void> {
  const loginPage = new LoginPage(page);
  await page.goto(`${BASE_URL}/login`);
  await loginPage.login(QA_EMAIL, QA_PASSWORD);
  await page.waitForURL("**/inbox", { timeout: 15_000 });
}
```

---

### 1 — Smoke tests (app loads without crash)

```ts
test.describe("Smoke: pages load", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  test("inbox loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/inbox/);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("settings page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
    await expect(page.locator("body")).toBeVisible();
  });

  test("stats page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/stats`);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("auto-responder settings page loads without crash", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/auto-responder`);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
    await expect(page.locator("body")).not.toContainText("ReferenceError");
  });
});
```

---

### 2 — Critical flows

```ts
test.describe("Critical flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQA(page);
  });

  test("login: valid credentials navigate to inbox", async ({ page }) => {
    // loginAsQA already asserts navigation — this test documents the happy path
    await expect(page).toHaveURL(/\/inbox/);
  });

  test("inbox: email list renders", async ({ page }) => {
    // At least one email row should be visible (QA account is pre-seeded)
    const emailRows = page.locator(
      '[data-testid="email-row"], [role="listitem"]',
    );
    await expect(emailRows.first()).toBeVisible({ timeout: 15_000 });
  });

  test("inbox: can open an email", async ({ page }) => {
    const firstEmail = page
      .locator('[data-testid="email-row"], [role="listitem"]')
      .first();
    await firstEmail.click();
    // Email detail panel should appear
    await expect(
      page.locator('[data-testid="email-detail"], [role="main"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("inbox: can switch between Triage and Follow-up tabs", async ({
    page,
  }) => {
    const triageTab = page
      .getByRole("tab", { name: /triage/i })
      .or(page.getByText(/triage/i).first());
    const followUpTab = page
      .getByRole("tab", { name: /follow.?up/i })
      .or(page.getByText(/follow.?up/i).first());

    await triageTab.click();
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );

    await followUpTab.click();
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("stats: leaderboard tab loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/stats`);
    const leaderboardTab = page
      .getByRole("tab", { name: /leaderboard/i })
      .or(page.getByText(/leaderboard/i).first());
    if (await leaderboardTab.isVisible({ timeout: 5_000 })) {
      await leaderboardTab.click();
    }
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("settings: auto-responder exclusion settings renders", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/settings/auto-responder`);
    // Look for exclusion rules section
    const exclusionSection = page.getByText(/exclusion/i).first();
    await expect(exclusionSection).toBeVisible({ timeout: 10_000 });
  });
});
```

---

### 3 — Regression guards (specific past bugs)

```ts
test.describe("Regression guards", () => {
  // Capture JS errors from the page
  let jsErrors: string[] = [];
  test.beforeEach(async ({ page }) => {
    jsErrors = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));
    await loginAsQA(page);
  });

  test("#650 — STRING_NONE: inbox loads without JS crash", async ({ page }) => {
    // Inbox must load without any ReferenceError for STRING_NONE
    await expect(page).toHaveURL(/\/inbox/);
    await page.waitForTimeout(2_000); // Let React settle

    const stringNoneErrors = jsErrors.filter((e) => e.includes("STRING_NONE"));
    expect(stringNoneErrors).toHaveLength(0);

    // Also assert inbox content is present (not crash screen)
    await expect(page.locator("body")).not.toContainText("GZQ39"); // error code from #650
    await expect(page.locator("body")).not.toContainText("STRING_NONE");
  });

  test("#654 — index is not defined: auto-responder exclusion settings renders", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/settings/auto-responder`);
    await page.waitForTimeout(2_000);

    const indexErrors = jsErrors.filter(
      (e) =>
        e.includes("index is not defined") ||
        e.includes("ReferenceError: index"),
    );
    expect(indexErrors).toHaveLength(0);

    // Page must not show crash UI
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
    await expect(page.locator("body")).not.toContainText(
      "index is not defined",
    );
  });
});
```

---

## CI Integration

> ⚠️ **Jeremy applies this YAML.** Do not commit workflow files directly — paste the
> snippet in the PR comment for Jeremy to add to `.github/workflows/`.

### Snippet to post as PR comment

```yaml
# Add to .github/workflows/e2e.yml  (or append to existing CI workflow)
name: e2e

on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      PLAYWRIGHT_BASE_URL: https://dashboard.focusbear.io
      TEST_EMAIL: internaltest+openclaw_qa@focusbear.io
      TEST_PASSWORD: ${{ secrets.QA_USER_PASSWORD }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: e2e/package-lock.json

      - name: Install e2e dependencies
        working-directory: e2e
        run: npm ci

      - name: Install Playwright browsers
        working-directory: e2e
        run: npx playwright install chromium --with-deps

      - name: Run regression tests
        working-directory: e2e
        run: npx playwright test tests/regression.spec.ts --reporter=github

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

**GitHub Secret required:** `QA_USER_PASSWORD` = `TestFocusBear2024!`
(Add at: `Settings → Secrets and variables → Actions → New repository secret`)

---

## Playwright Config Notes

The existing `playwright.config.ts` already handles CI correctly:

- `retries: process.env.CI ? 2 : 0` — retries on flaky network
- `workers: process.env.CI ? 1 : undefined` — sequential in CI (avoids race conditions on shared QA account)
- `timeout: 120000` — generous timeout for AI-powered operations
- `forbidOnly: !!process.env.CI` — catches accidental `.only` left in

No changes to `playwright.config.ts` needed.

---

## Implementation Steps

1. **Branch:** `feat/issue-656-e2e-regression-tests` ✅ (this branch)
2. Create `e2e/tests/regression.spec.ts` with all four `describe` blocks above
3. Run locally against staging to validate selectors: `cd e2e && npx playwright test tests/regression.spec.ts --headed`
4. Tune selectors if QA account's DOM differs from assumptions (likely need `data-testid` additions)
5. Open PR
6. Post CI YAML snippet as PR comment — Jeremy applies to `.github/workflows/`

---

## Future Additions (out of scope for this PR)

- `#659` regression guard: category dropdown shows >2 options
- Login failure test (wrong password → stays on login page)
- Email search returns results
- Reply compose opens without crash

---

🧘 This PR was created by Monk of Modularity (AI Agent).
