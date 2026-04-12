# BearlyMail Development Instructions

## Project Overview

BearlyMail is an ADHD-friendly email client designed to minimize cognitive load and maximize productivity. It features intelligent email prioritization, automated reply drafting, email batching, contextual learning, and Google Calendar integration. The application uses LLM-powered features (Google Gemini and OpenAI) for summarization, prioritization, and reply generation.

**Key Features:**

- Intelligent email prioritization with dynamic scoring (0-100)
- Rule-based email summarization (bullet points, action items, TL;DR)
- Focused email delivery (batching non-urgent emails)
- Quick snooze with natural language parsing
- Private notes on email threads
- Automated reply drafting with contextual learning
- Google Calendar integration for meeting scheduling

## Tech Stack

### Backend

- **Framework**: NestJS (Node.js) with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT with Passport (local strategy + Google OAuth)
- **Job Queue**: pg-boss for background jobs
- **LLM**: Google Gemini (default) and OpenAI with router support
- **Encryption**: AES-256-GCM for sensitive data at rest

### Frontend

- **Framework**: React 19 with TypeScript
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **i18n**: react-i18next
- **Testing**: Playwright for E2E tests

### Testing

- **E2E**: Playwright (tests in `/e2e` directory)
- **Test Runner**: Page Object Model (POM) pattern

## Project Structure

```
email-client/
├── server/                 # NestJS backend
│   ├── src/
│   │   ├── auth/          # Authentication (JWT, OAuth, local strategy)
│   │   ├── calendar/       # Google Calendar integration
│   │   ├── context/       # User context learning
│   │   ├── database/      # TypeORM entities and migrations
│   │   ├── emails/        # Email management (sync, inbox, CRUD)
│   │   ├── encryption/   # AES-256-GCM encryption helpers
│   │   ├── notes/         # Private notes
│   │   ├── priority/      # Prioritization logic and rules
│   │   ├── replies/       # Reply generation
│   │   ├── snooze/        # Snooze functionality
│   │   ├── summarization/ # Email summarization
│   │   └── users/         # User management
│   ├── scripts/           # Utility scripts (seed, migrations, analysis)
│   ├── logs/             # Performance and error logs
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── contexts/       # React contexts (Auth)
│   │   ├── pages/         # Page components (Inbox, EmailDetail, etc.)
│   │   ├── theme/         # Color scheme and theme
│   │   └── App.tsx
│   └── package.json
├── e2e/                    # Playwright E2E tests
│   ├── pages/             # Page Object Model classes
│   ├── tests/              # Test files
│   └── utils/              # Test utilities (NetworkTracker, etc.)
└── package.json
```

## Development Workflow

1. **Make changes** to code
2. **Write Playwright tests** in `e2e/tests/` directory (use Page Object Model)
3. **Run tests**: `npm run test:e2e` (from root) or `cd e2e && npm test`
4. **Tests must pass** before task is complete
5. **Check performance**: Monitor `server/logs/performance.log` for budget violations

### Running the Application

```bash
# Install all dependencies
npm run install-all

# Start both server and client in development mode
npm run dev

# Or run separately:
npm run server  # Backend on http://localhost:3005
npm run client  # Frontend on http://localhost:3000
```

### Database Setup

```bash
# Run migrations
cd server && npm run migration:run

# Seed test user (for E2E tests)
cd server && npm run seed:test-user
```

## Code Standards

### TypeScript

- **Strict mode**: Always enabled
- **Type safety**: Use proper types, avoid `any` when possible
- **Interfaces**: Define clear interfaces for API responses and data structures

### Backend (NestJS)

- **Modules**: Follow NestJS module pattern
- **Services**: Business logic in services, not controllers
- **Controllers**: Handle HTTP requests/responses only
- **Error handling**: Use NestJS exceptions (`UnauthorizedException`, `NotFoundException`, etc.)
- **Logging**: Use NestJS `Logger` class
- **Performance**:
  - Use raw SQL queries for list views to avoid TypeORM entity hydration overhead
  - Add performance budgets and track spans (see `PerformanceTracker` class)
  - Log performance issues to `server/logs/performance.log`
- **Encryption**:
  - Use `EncryptionHelper` for encrypting/decrypting sensitive fields
  - Fields using `encryptedJsonTransformer` need manual JSON parsing after decryption
  - Never log encrypted data

### Frontend (React)

- **Hooks**: Prefer functional components with hooks
- **State management**: Use React Context for global state (Auth)
- **API calls**: Use Axios with `API_URL` from environment
- **Error handling**: Show user-friendly error messages
- **Loading states**: Always show loading indicators for async operations
- **Accessibility**:
  - Use semantic HTML
  - Add ARIA labels where needed
  - Ensure keyboard navigation works
  - Follow WCAG 2.1 AA compliance

### Database

- **Migrations**: Always create migrations for schema changes
- **Indexes**: Add indexes for frequently queried columns (see `server/scripts/check-and-add-indexes.ts`)
- **Raw queries**: Use raw SQL for performance-critical queries (avoid TypeORM entity hydration)
- **Encryption**: Sensitive fields are encrypted at rest (see `ENCRYPTION.md`)

## Performance Requirements

### Performance Budgets

- **Inbox load (triage mode)**: 500ms total
- **Inbox load (process mode)**: 1000ms total
- **Thread query**: 100ms (triage) / 300ms (process)
- **Email query**: 100ms
- **Decryption**: 100ms
- **Priority calculation**: 200ms
- **Batch status**: 500ms
- **Consent status**: 200ms
- **Triage suggestions**: 1000ms total

### Performance Optimization Guidelines

1. **Use raw SQL queries** for list views (inbox, search results) to avoid TypeORM entity hydration
2. **Only decrypt fields needed** for display (from, fromName, subject, summary)
3. **Batch database operations** when possible
4. **Cache frequently accessed data** (e.g., batch-status in localStorage with 30min expiry)
5. **Run API calls in parallel** using `Promise.all()` when possible
6. **Monitor performance logs** in `server/logs/performance.log`
7. **Add performance spans** for all major operations using `PerformanceTracker`

## Testing Requirements

### E2E Tests (Playwright)

- **Location**: All tests in `e2e/tests/` directory
- **Pattern**: Use Page Object Model (POM) - page objects in `e2e/pages/`
- **Selectors**: Prefer `data-testid` attributes, use CSS selectors as fallback
- **Test coverage**:
  - Test both happy path and error cases
  - Test performance (load times, network requests)
  - Test accessibility (keyboard navigation, screen readers)
- **Test user**: Use `test@example.com` / `testpassword` (seed with `npm run seed:test-user`)
- **Running tests**:
  ```bash
  cd e2e
  npm test              # Headless
  npm run test:ui       # UI mode
  npm run test:headed   # Headed browser
  npm run test:watch    # Watch mode
  ```

### Test Structure

```typescript
// Use Page Object Model
import { LoginPage } from "../pages/LoginPage";
import { InboxPage } from "../pages/InboxPage";

test("should load inbox", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.login("test@example.com", "testpassword");

  const inboxPage = new InboxPage(page);
  await inboxPage.waitForInboxToLoad();
  // ... assertions
});
```

## Important Notes

### Security

- **Never modify** `/config/production-secrets.json`
- **Encryption key**: Must be set via `ENCRYPTION_KEY` environment variable
- **Passwords**: Hashed with bcrypt (never stored in plaintext)
- **Sensitive data**: All email content, subjects, sender info encrypted at rest

### Accessibility

- **WCAG 2.1 AA compliance**: Required for all UI components
- **Neurodivergent-friendly UX**:
  - Clear labels and instructions
  - No time pressure or hidden information
  - Consistent navigation patterns
  - High contrast colors
  - Keyboard navigation support

### Database

- **Migrations**: Always run migrations before deploying
- **Indexes**: Check for missing indexes using `npm run check-indexes`
- **Query analysis**: Use `npm run analyze-queries` to analyze slow queries
- **Connection**: Uses SSL in production (configure via `DB_SSL` env var)

### Environment Variables

- **Backend**: See `server/.env.example`
- **Frontend**: `REACT_APP_API_URL` must point to backend (default: `http://localhost:3005`)
- **Required**: `ENCRYPTION_KEY`, `DB_*`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Common Patterns

#### Raw SQL Query (Performance)

```typescript
// Instead of TypeORM getMany() which hydrates entities
const rawEmails = await this.emailRepository.query(
  `SELECT id, "from", subject FROM emails WHERE id = ANY($1::uuid[])`,
  [emailIds],
);

// Manually decrypt only needed fields
const decrypted = rawEmails.map((row) => ({
  id: row.id,
  from: EncryptionHelper.decrypt(row.from),
  subject: EncryptionHelper.decrypt(row.subject),
}));
```

#### Performance Tracking

```typescript
const perf = new PerformanceTracker("operationName");
const endSpan = perf.startSpan("spanName", 100); // 100ms budget
// ... do work ...
endSpan();
perf.finish(); // Logs if budget exceeded
```

#### Error Handling

```typescript
// Backend
throw new UnauthorizedException("User not approved");

// Frontend
try {
  await axios.get("/api/endpoint");
} catch (error: any) {
  if (error.response?.status === 401) {
    // Handle auth error
  }
}
```

## Troubleshooting

### Performance Issues

1. Check `server/logs/performance.log` for budget violations
2. Run `npm run analyze-queries` to identify slow queries
3. Check for missing indexes with `npm run check-indexes`
4. Use raw SQL queries instead of TypeORM entities for list views

### Test Failures

1. Ensure test user is seeded: `npm run seed:test-user`
2. Check that database is running and accessible
3. Verify `REACT_APP_API_URL` is correct in E2E tests
4. Check server logs for errors

### Encryption Issues

1. Verify `ENCRYPTION_KEY` is set in environment
2. Check that encrypted fields are properly decrypted in raw queries
3. For JSON fields (labels, priorityExplanation), decrypt then parse JSON

## Resources

- **README.md**: Full project documentation
- **ENCRYPTION.md**: Encryption implementation details
- **PERFORMANCE_ANALYSIS.md**: Performance optimization notes
- **e2e/README.md**: E2E testing guide
