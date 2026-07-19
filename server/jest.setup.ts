/**
 * Jest Setup File
 * - Detects slow tests (>1s)
 * - Warns about potential real network requests
 * - Provides timing information for debugging
 */

// Provide required secrets so modules that now fail-fast on a missing
// JWT_SECRET / ENCRYPTION_KEY (no more hardcoded fallbacks) can boot in tests.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-1234567890-strong-32";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-1234567890-32";

// Only enable timing tracking when explicitly requested
if (process.env.JEST_TIMING === 'true' || process.env.DETECT_NETWORK_CALLS === 'true') {
  // Track test start times
  const testStartTimes = new Map<string, number>();

  // Before each test
  beforeEach(() => {
    const testName = expect.getState().currentTestName || 'unknown';
    testStartTimes.set(testName, Date.now());
  });

  // After each test
  afterEach(() => {
    const testName = expect.getState().currentTestName || 'unknown';
    const startTime = testStartTimes.get(testName);

    if (startTime) {
      const duration = Date.now() - startTime;

      // Warn about slow tests (>1 second)
      if (duration > 1000) {
        console.warn(
          `\n⚠️  SLOW TEST (${duration}ms): ${testName}\n` +
          `   This test took longer than 1 second. Consider:\n` +
          `   - Mocking external dependencies\n` +
          `   - Reducing test complexity\n` +
          `   - Checking for real network requests\n`
        );
      }

      // Log timing for all tests when JEST_TIMING=true
      if (process.env.JEST_TIMING === 'true') {
        console.log(`✓ ${testName} (${duration}ms)`);
      }

      testStartTimes.delete(testName);
    }
  });
}

// Mock network detection
const originalFetch = global.fetch;
const originalXMLHttpRequest = global.XMLHttpRequest;

if (process.env.DETECT_NETWORK_CALLS === 'true') {
  // Override fetch to detect real calls
  global.fetch = jest.fn((...args) => {
    const url = args[0];
    console.error(
      `\n❌ REAL NETWORK REQUEST DETECTED!\n` +
      `   Test: ${expect.getState().currentTestName}\n` +
      `   URL: ${url}\n` +
      `   This test is making a real network request. Please mock this call.\n`
    );
    throw new Error(`Unmocked network request to ${url}`);
  }) as any;

  // Log when tests are using axios/other HTTP clients
  // (They should be mocked at the module level)
}

// Restore originals after all tests
afterAll(() => {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  if (originalXMLHttpRequest) {
    global.XMLHttpRequest = originalXMLHttpRequest;
  }
});
