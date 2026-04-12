# CI Integration Tests Setup

This document describes the CI workflow changes needed to run integration tests separately.

## Required Changes to `.github/workflows/ci.yml`

### 1. Update the `server-coverage` job

Change the test command to exclude integration tests:

```yaml
# BEFORE
- name: Run tests with coverage
  working-directory: server
  env:
    DB_HOST: localhost
    DB_PORT: 5432
    DB_USERNAME: test
    DB_PASSWORD: test
    DB_NAME: test
    JWT_SECRET: test-jwt-secret
    ENCRYPTION_KEY: test-encryption-key-32chars!!
    NODE_OPTIONS: --max-old-space-size=4096
  run: npm run test:cov -- --forceExit

# AFTER
- name: Run unit tests with coverage
  working-directory: server
  env:
    DB_HOST: localhost
    DB_PORT: 5432
    DB_USERNAME: test
    DB_PASSWORD: test
    DB_NAME: test
    JWT_SECRET: test-jwt-secret
    ENCRYPTION_KEY: test-encryption-key-32chars!!
    NODE_OPTIONS: --max-old-space-size=4096
  run: npm run test:cov -- --forceExit
```

### 2. Add new `server-integration-tests` job

Add this new job after the `server-coverage` job:

```yaml
server-integration-tests:
  name: Server Integration Tests
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
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: "npm"
        cache-dependency-path: server/package-lock.json

    - name: Install dependencies
      working-directory: server
      run: npm ci

    - name: Run integration tests
      working-directory: server
      env:
        DB_HOST: localhost
        DB_PORT: 5432
        DB_USERNAME: test
        DB_PASSWORD: test
        DB_NAME: test
        JWT_SECRET: test-jwt-secret
        ENCRYPTION_KEY: test-encryption-key-32chars!!
        NODE_OPTIONS: --max-old-space-size=4096
      run: npm run test:integration -- --forceExit
```

## Why This Separation?

1. **Performance**: Integration tests are slower than unit tests because they:
   - Connect to real PostgreSQL database
   - Run full request/response cycles
   - Execute sequentially (`--runInBand`) to avoid conflicts

2. **Clarity**: Separating jobs makes it clear which type of test failed:
   - Unit test failures indicate logic/mock issues
   - Integration test failures indicate database/API issues

3. **Parallel Execution**: CI can run both jobs in parallel, reducing overall build time

4. **Resource Management**: Integration tests use `--runInBand` to avoid:
   - Database connection conflicts
   - Race conditions in test data
   - Transaction isolation issues

## Test Naming Convention

- **Unit tests**: `*.spec.ts` (e.g., `llm.service.spec.ts`)
  - Run with: `npm run test:unit` or `npm run test:cov`
  - CI Job: `server-coverage`

- **Integration tests**: `*.integration.spec.ts` (e.g., `llm.controller.integration.spec.ts`)
  - Run with: `npm run test:integration`
  - CI Job: `server-integration-tests`

## Manual Application

Since Claude Code doesn't have permission to modify workflow files, you'll need to manually apply these changes to `.github/workflows/ci.yml`.

The changes are:

1. Rename the step "Run tests with coverage" to "Run unit tests with coverage" (no functional change, just clarity)
2. Add the new `server-integration-tests` job as shown above

After applying these changes, the CI pipeline will run unit tests and integration tests in separate jobs, improving visibility and allowing for better parallelization.
