# Testing Guide

## Test Types

BearlyMail uses different types of tests with specific naming conventions:

### Unit Tests (`*.spec.ts`)

- **Purpose**: Fast, isolated tests for individual functions and components
- **Naming**: `*.spec.ts` (e.g., `email.service.spec.ts`)
- **Run with**: `npm run test:unit` or `npm run test:cov`
- **CI Job**: `server-coverage`
- **Characteristics**:
  - Mock external dependencies
  - No database connections
  - Fast execution (< 1s per test)
  - High code coverage targets

### Integration Tests (`*.integration.spec.ts`)

- **Purpose**: Test module interactions with real database and services
- **Naming**: `*.integration.spec.ts` (e.g., `llm.controller.integration.spec.ts`)
- **Run with**: `npm run test:integration` or `npm run test:integration:cov`
- **CI Job**: `server-integration-tests`
- **Characteristics**:
  - Use real PostgreSQL database
  - Test complete request/response cycles
  - Slower execution (may take several seconds per test)
  - Tests API endpoints end-to-end
  - Run sequentially (`--runInBand`) to avoid conflicts

### E2E Tests (`*.e2e-spec.ts` in `/test`)

- **Purpose**: Full application tests with all services running
- **Naming**: `*.e2e-spec.ts` in `/test` directory
- **Run with**: `npm run test:e2e`
- **CI Job**: None (run manually before releases)

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests (fast)
npm run test:unit

# Run only integration tests (slower)
npm run test:integration

# Run unit tests with coverage
npm run test:cov

# Run integration tests with coverage
npm run test:integration:cov

# Watch mode (unit tests only)
npm run test:watch

# E2E tests
npm run test:e2e
```

## Writing Integration Tests

Integration tests should:

1. Use the `*.integration.spec.ts` naming convention
2. Import `@nestjs/testing` utilities
3. Use a real PostgreSQL database connection
4. Test complete API request/response cycles
5. Clean up test data in `afterEach` or `afterAll` hooks
6. Use `--runInBand` to run sequentially (already configured)

### Example Integration Test

```typescript
// llm.controller.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('LLM Controller Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /llm/providers should return available providers', () => {
    return request(app.getHttpServer())
      .get('/llm/providers')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('providers');
        expect(Array.isArray(res.body.providers)).toBe(true);
      });
  });
});
```

## CI Pipeline

### Unit Tests (`server-coverage`)
- Runs on every PR
- Must pass for PR to be merged
- Uses `npm run test:cov -- --forceExit`
- Only runs `*.spec.ts` files (excludes `*.integration.spec.ts`)
- Fast execution (~1-2 minutes)

### Integration Tests (`server-integration-tests`)
- Runs on every PR
- Must pass for PR to be merged
- Uses `npm run test:integration -- --forceExit`
- Only runs `*.integration.spec.ts` files
- Slower execution (~5-10 minutes)
- Requires PostgreSQL service

## Test Organization

```
server/src/
├── llm/
│   ├── llm.service.ts
│   ├── llm.service.spec.ts              # Unit tests (mocked)
│   ├── llm.controller.ts
│   └── llm.controller.integration.spec.ts  # Integration tests (real DB)
├── emails/
│   ├── emails.service.ts
│   ├── emails.service.spec.ts           # Unit tests
│   ├── emails.controller.ts
│   └── emails.controller.integration.spec.ts  # Integration tests
```

## Best Practices

### Unit Tests
- ✅ Mock all external dependencies (database, HTTP, LLM providers)
- ✅ Test pure logic and business rules
- ✅ Fast execution (< 1s per test)
- ✅ High code coverage
- ❌ Don't connect to real database
- ❌ Don't make real HTTP calls

### Integration Tests
- ✅ Use real database connections
- ✅ Test complete API endpoints
- ✅ Test authentication and authorization
- ✅ Test error handling and edge cases
- ✅ Clean up test data after tests
- ❌ Don't test implementation details
- ❌ Don't duplicate unit test coverage

## Coverage Requirements

- **Unit Tests**: 80%+ for critical paths (auth, email CRUD, encryption)
- **Integration Tests**: Cover all API endpoints and user flows
- **E2E Tests**: Cover complete user journeys (run manually)
