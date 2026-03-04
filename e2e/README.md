# E2E Tests

This directory contains end-to-end tests using Playwright with the Page Object Model (POM) pattern.

## Project Structure

```
e2e/
├── pages/              # Page Object Model classes
│   ├── BasePage.ts     # Base page with common functionality
│   ├── LoginPage.ts    # Login page interactions
│   ├── InboxPage.ts    # Inbox page interactions
│   ├── SearchPage.ts   # Search page interactions
│   └── PriorityTooltip.ts  # Priority tooltip component
├── utils/              # Utility classes
│   └── NetworkTracker.ts   # Network request tracking utility
├── tests/              # Test specifications
│   ├── inbox-load-time.spec.ts  # CI — inbox performance
│   ├── search-ci.spec.ts        # CI — search with seeded data
│   └── search-debug.spec.ts     # LOCAL ONLY — search debug with real mailbox
├── playwright.config.ts
└── package.json
```

---

## Running Locally

```bash
# Install dependencies
cd e2e && npm install

# Make sure the client (port 3000) and server (port 3005) are running,
# then run all CI-safe tests:
npx playwright test search-ci.spec.ts inbox-load-time.spec.ts

# Run search-debug tests (requires a real Gmail connection):
npx playwright test search-debug.spec.ts

# Open the interactive UI runner:
npm run test:ui
```

---

## Running in CI

CI uses the `e2e-tests` job in `.github/workflows/ci.yml`.  It:
1. Spins up a Postgres service container
2. Builds the server and runs migrations
3. Seeds the test user (`npm run seed:test-user`)
4. Seeds search data (`npm run seed:search-data`)
5. Starts the server with `CI_SEARCH_FALLBACK=true`
6. Builds the client and serves it with `vite preview`
7. Runs `search-ci.spec.ts` and `inbox-load-time.spec.ts`

---

## Seeded Test Data

### Test user
| Field    | Value              |
|----------|--------------------|
| Email    | test@example.com   |
| Password | testpassword       |

Created by `server/scripts/seed-test-user.ts` (`npm run seed:test-user`).

### Search seed emails
Created by `server/scripts/seed-search-data.ts` (`npm run seed:search-data`).

| Scenario   | Query                             | Seeded subjects / from                                        |
|------------|-----------------------------------|---------------------------------------------------------------|
| Has results | `test`                           | "Test meeting notes for Q2", "Follow-up: test results…"       |
| No results  | `xyzabc123nonexistentquery98765` | (nothing matches — by design)                                 |
| Rejected    | `meeting`                        | "Team meeting agenda…" (strong match), plus a weak match that may be ranked low |

The seed script is **idempotent** — safe to run multiple times.

---

## `CI_SEARCH_FALLBACK` flag

BearlyMail's search normally requires a connected email provider (Gmail / Office365 / Zoho).
In CI there is no real provider, so the server exposes a local-DB fallback:

```
CI_SEARCH_FALLBACK=true
```

When this env var is set the `EmailSearchService` loads all of the test user's
emails from Postgres, decrypts them in-memory, and filters by the query string.
This is suitable only for small datasets (CI seed data).

---

## Which test files run in CI vs locally

| File                      | CI | Local |
|---------------------------|----|-------|
| `inbox-load-time.spec.ts` | ✅ | ✅    |
| `search-ci.spec.ts`       | ✅ | ✅    |
| `search-debug.spec.ts`    | ❌ | ✅    |

`search-debug.spec.ts` reads from `server/logs/search-system.log` and uses
real Gmail queries — it is intended for local debugging only.

---

## Environment Variables

| Variable              | Default                | Purpose                                    |
|-----------------------|------------------------|--------------------------------------------|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000`| URL of the running client                  |
| `TEST_EMAIL`          | `test@example.com`     | Login email for the seeded test user        |
| `TEST_PASSWORD`       | `testpassword`         | Login password for the seeded test user     |
| `CI`                  | (unset)                | Set by CI; disables Chrome persistent context |
| `CHROME_USER_DATA_DIR`| macOS Chrome default   | Override Chrome profile path for local runs|

---

## Adding New Search Test Scenarios

1. Add seed emails to `server/scripts/seed-search-data.ts` (use a unique `messageId` per email)
2. Add a corresponding `test(...)` block in `e2e/tests/search-ci.spec.ts`
3. Use `searchPage.search('your query')` + `searchPage.waitForResults()` + assertions
4. Keep search queries deterministic — avoid AI-generated terms that may vary

---

## Page Object Model

- **BasePage**: Base class with common page functionality
- **LoginPage**: Handles login form interactions
- **InboxPage**: Handles inbox page interactions and priority badge finding
- **SearchPage**: Handles search form, results, queries-tried, and rejected-emails sections
- **PriorityTooltip**: Handles priority tooltip interactions and content verification
- **NetworkTracker**: Utility class for tracking and analyzing network requests
