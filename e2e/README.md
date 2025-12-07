# E2E Tests

This directory contains end-to-end tests using Playwright with the Page Object Model (POM) pattern.

## Project Structure

```
e2e/
├── pages/              # Page Object Model classes
│   ├── BasePage.ts     # Base page with common functionality
│   ├── LoginPage.ts    # Login page interactions
│   ├── InboxPage.ts    # Inbox page interactions
│   └── PriorityTooltip.ts  # Priority tooltip component
├── utils/              # Utility classes
│   └── NetworkTracker.ts   # Network request tracking utility
├── tests/              # Test specifications
│   └── inbox-load-time.spec.ts
├── playwright.config.ts
└── package.json
```

## Page Object Model

The tests use the Page Object Model pattern for better maintainability:

- **BasePage**: Base class with common page functionality
- **LoginPage**: Handles login form interactions
- **InboxPage**: Handles inbox page interactions and priority badge finding
- **PriorityTooltip**: Handles priority tooltip interactions and content verification
- **NetworkTracker**: Utility class for tracking and analyzing network requests

## Setup

1. Install dependencies:
```bash
cd e2e
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Configuration

### 1. Seed Test User (REQUIRED - Must be done before running tests)

**IMPORTANT**: The application uses a waitlist system, so you cannot register users through the UI. You must seed the test user before running tests.

Before running tests, create a test user in the database:

```bash
cd server
npm run seed:test-user
```

This creates an approved user with:
- Email: `test@example.com`
- Password: `testpassword`
- Status: Approved (can login immediately)

**Note**: If you see "Authentication failed" errors, the test user likely doesn't exist or isn't approved. Run the seed script again.

### 2. Set Environment Variables

Set environment variables in `.env` file or export them:

```bash
export TEST_EMAIL=test@example.com
export TEST_PASSWORD=testpassword
export REACT_APP_API_URL=http://localhost:3005
export PLAYWRIGHT_BASE_URL=http://localhost:3000
```

**Note**: The tests require the test user to be seeded beforehand. Registration is not available through the UI due to the waitlist system.

## Running Tests

```bash
# Run all tests (headless)
npm test

# Run with UI mode (interactive test runner with browser visible)
npm run test:ui

# Run in headed mode (see browser, no UI)
npm run test:headed

# Run with UI mode AND visible browser (best for watching tests)
npm run test:watch

# Debug mode (step through tests)
npm run test:debug

# View test report
npm run test:report
```

### Recommended: Watch Tests in Browser

To watch the tests run in a visible browser with the interactive UI:

```bash
cd e2e
TEST_EMAIL=test@example.com TEST_PASSWORD=testpassword REACT_APP_API_URL=http://localhost:3001 PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:watch
```

This will:
- Open the Playwright UI with test controls
- Show the browser window as tests run
- Allow you to pause, step through, and inspect tests
- Show network requests and console logs in real-time

## Tests

### 1. Inbox Load Performance

The `inbox-load-time.spec.ts` file contains two tests:

#### Test 1: Inbox Load Performance
- Logs in to the application
- Navigates to the inbox
- Measures load time
- Tracks all network requests
- Verifies load time is under 2 seconds
- Reports duplicate API calls
- Provides detailed network request analysis

#### Test 2: Priority Popup Performance
- Logs in and navigates to inbox
- Finds a priority badge
- Hovers/clicks to trigger the priority popup
- Measures popup load time (must be under 1 second)
- Verifies the popup displays:
  - Priority Score header with numeric score
  - Urgency dimension with score
  - Goal Alignment dimension with score
  - VIP Contact dimension with score
- Tracks API request for priority explanation
- Verifies API request is fast (under 500ms)
- Checks for duplicate API requests
- Provides detailed performance analysis

