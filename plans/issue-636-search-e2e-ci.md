# Plan: Enable search-debug e2e tests with seeded data in CI

**Issue:** [#636](https://github.com/Focus-Bear/BearlyMail/issues/636)

## Problem

The `search-debug.spec.ts` Playwright tests are not included in CI. They currently rely on:

1. A live mailbox with real emails (searches for "test", "meeting", etc.)
2. A running Chrome profile with persistent login state (macOS-specific path)
3. Backend `logs/search-system.log` file on the local filesystem
4. A running local dev server (client on `:3000`, server on `:3005`)

None of this works in CI. The existing `inbox-load-time.spec.ts` tests use a seeded test user via `seed-test-user.ts`, but there's no seeded email data for search.

## Tasks

### 1. Create a seed script for deterministic search test data

**File:** `server/scripts/seed-search-data.ts`

Create a script that:

- Reuses the seeded test user from `seed-test-user.ts` (email: `test@example.com`)
- Inserts deterministic email records into the database with known senders, subjects, and bodies
- Covers the three test scenarios:
  - **Has results:** Emails matching the query "test" (e.g., subject: "Test meeting notes", from: "testuser@example.com")
  - **No results:** Ensures the nonsensical query `xyzabc123nonexistentquery98765` won't match anything
  - **Rejected emails (below threshold):** Emails with known low relevance scores so the rejected-emails UI can be tested
- Uses the same DB connection pattern as `seed-test-user.ts` (TypeORM DataSource, env vars)
- Is idempotent (safe to run multiple times)

Add npm script: `"seed:search-data": "ts-node -r tsconfig-paths/register scripts/seed-search-data.ts"` to `server/package.json`.

**Key consideration:** Search in BearlyMail goes through AI/Gmail query generation. For CI, the seed data must exist in the local DB and the search endpoint must be able to query it without hitting Gmail APIs. Check how `inbox-load-time.spec.ts` handles this — if search requires a Gmail connection, the test may need to mock the Gmail layer or test a local-only search path.

### 2. Refactor `search-debug.spec.ts` for CI compatibility

**File:** `e2e/tests/search-debug.spec.ts`

Changes needed:

- **Remove filesystem log reading:** The `readSearchLogLines()` and `filterLogForQuery()` helpers read from `server/logs/search-system.log`, which won't exist in CI. Move log assertions to informational console output only (don't fail tests on missing logs).
- **Use deterministic queries:** Replace ad-hoc queries ("test", "meeting") with queries that match the seeded data exactly.
- **Split into CI-safe and debug-only files:**
  - `search-ci.spec.ts` — strict, deterministic, CI-ready
  - `search-debug.spec.ts` — keep as-is for local debugging (not run in CI)
- **Handle search-backend dependency:** If search requires Gmail API, add a mock/stub for CI or skip those assertions with clear documentation.

### 3. Update Playwright config for CI

**File:** `e2e/playwright.config.ts`

Current config is macOS-centric (Chrome user data dir in `~/Library/Application Support/`):

- Remove the persistent Chrome context for CI (`process.env.CI` check)
- Use a fresh browser context in CI instead of a persistent Chrome profile
- Uncomment the `webServer` config for CI so Playwright starts the dev server automatically, OR start client/server in the CI workflow before running tests

### 4. Add e2e job to CI workflow

**File:** `.github/workflows/ci.yml`

Add a new job `e2e-tests` that:

```yaml
e2e-tests:
  name: E2E Tests
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:17
      env:
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
        POSTGRES_DB: test
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
    - name: Install server dependencies
      working-directory: server
      run: npm ci --legacy-peer-deps
    - name: Build server
      working-directory: server
      run: npm run build
    - name: Run migrations
      working-directory: server
      env:
        {
          DB_HOST: localhost,
          DB_PORT: 5432,
          DB_USERNAME: test,
          DB_PASSWORD: test,
          DB_NAME: test,
        }
      run: npx typeorm migration:run -d dist/data-source.js
    - name: Seed test user
      working-directory: server
      env:
        {
          DB_HOST: localhost,
          DB_PORT: 5432,
          DB_USERNAME: test,
          DB_PASSWORD: test,
          DB_NAME: test,
          ENCRYPTION_KEY: test-encryption-key-32chars!!,
        }
      run: npm run seed:test-user
    - name: Seed search data
      working-directory: server
      env:
        {
          DB_HOST: localhost,
          DB_PORT: 5432,
          DB_USERNAME: test,
          DB_PASSWORD: test,
          DB_NAME: test,
          ENCRYPTION_KEY: test-encryption-key-32chars!!,
        }
      run: npm run seed:search-data
    - name: Start server
      working-directory: server
      env:
        {
          DB_HOST: localhost,
          DB_PORT: 5432,
          DB_USERNAME: test,
          DB_PASSWORD: test,
          DB_NAME: test,
          JWT_SECRET: test-jwt-secret,
          ENCRYPTION_KEY: test-encryption-key-32chars!!,
          PORT: 3005,
          NODE_ENV: test,
        }
      run: node dist/main.js &
    - name: Install client dependencies
      working-directory: client
      run: npm install
    - name: Build and serve client
      working-directory: client
      env: { REACT_APP_API_URL: http://localhost:3005 }
      run: npm run build && npx serve -s build -l 3000 &
    - name: Install Playwright browsers
      working-directory: e2e
      run: npx playwright install --with-deps chromium
    - name: Run e2e tests
      working-directory: e2e
      env:
        {
          CI: true,
          PLAYWRIGHT_BASE_URL: http://localhost:3000,
          TEST_EMAIL: test@example.com,
          TEST_PASSWORD: testpassword,
        }
      run: npx playwright test search-ci.spec.ts inbox-load-time.spec.ts
    - name: Upload test report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: e2e/playwright-report/
```

### 5. Update test documentation

**File:** `e2e/README.md` (create if doesn't exist)

Document:

- How to run e2e tests locally vs in CI
- How the seed data works
- Which test files are CI-only vs debug-only
- Environment variables needed
- How to add new search test scenarios

## Risks & Open Questions

1. **Gmail API dependency:** Does the search endpoint work without a real Gmail connection? If search calls Gmail's API directly, seeded DB data alone won't be enough. This is the biggest unknown — investigate the search endpoint code first.
2. **PgBoss:** The CI smoke test initializes PgBoss schema. If search uses background jobs, the e2e job needs the same setup.
3. **Build tool:** The client uses Vite (`import.meta.env`), so ensure the CI build step uses the right env var format (`VITE_*` not `REACT_APP_*`).
4. **Test flakiness:** The 120s Playwright timeout and AI processing in search could cause intermittent failures in CI. Consider mocking the AI layer for deterministic results.

## Acceptance Criteria (from issue)

- [ ] Seed script creates deterministic data that search tests can reliably query
- [ ] `search-debug.spec.ts` (or new `search-ci.spec.ts`) passes against seeded data in CI
- [ ] CI workflow is updated to include search e2e coverage
- [ ] Test docs updated with the final CI commands and constraints
