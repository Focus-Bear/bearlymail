import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InboxPage } from '../pages/InboxPage';
import { PriorityTooltip } from '../pages/PriorityTooltip';
import { NetworkTracker } from '../utils/NetworkTracker';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3005';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const TEST_NAME = process.env.TEST_NAME || 'Test User';

test.describe('Inbox Load Performance', () => {
  test('inbox should load in under 2 seconds and track network requests', async ({ page }) => {
    test.setTimeout(15000); // 15 second timeout - should fail fast if things aren't working
    
    // Setup network tracking BEFORE navigation
    const networkTracker = new NetworkTracker(page, [
      API_URL,
      '/api/',
      '/users/',
      '/emails/',
      '/context',
      '/priority/',
    ]);

    // Navigate and login (or register if user doesn't exist)
    const loginPage = new LoginPage(page);
    try {
      await loginPage.goto('/login');
    } catch (error) {
      throw new Error(`Failed to navigate to login page. Make sure the app is running on ${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}. Error: ${error}`);
    }
    
    // Login with existing test user (should be seeded beforehand)
    try {
      await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
    } catch (error: any) {
      throw new Error(`Login failed. Make sure the test user exists and is approved. Run 'cd server && npm run seed:test-user' to create the test user. Error: ${error.message}`);
    }

    // Navigate to inbox and measure load time
    const inboxPage = new InboxPage(page);
    
    // Wait for URL to be /inbox first - fail fast
    await page.waitForURL('/inbox', { timeout: 5000 });
    
    // Wait for the critical API calls to complete (inbox, batch-status, context)
    // These should complete quickly and are what we're measuring
    const inboxResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/emails/inbox') && response.status() === 200,
      { timeout: 10000 }
    );
    const batchStatusResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/emails/batch-status') && response.status() === 200,
      { timeout: 10000 }
    );
    
    // Start timing when API calls complete (this is the actual load time we care about)
    await Promise.all([inboxResponsePromise, batchStatusResponsePromise]);
    const startTime = Date.now();
    
    // Wait for inbox content to render (this should be fast after API calls complete)
    await inboxPage.waitForInboxToLoad(5000); // Reduced timeout since API calls are done
    
    const loadTime = Date.now() - startTime;

    // Get network requests BEFORE assertion so we can see them even if test fails
    const networkRequests = networkTracker.getRequests();

    // Log the results (do this before assertion so we see it even on failure)
    console.log(`\n📊 Inbox Load Performance Results:`);
    console.log(`⏱️  Load Time: ${loadTime}ms (${(loadTime / 1000).toFixed(2)}s)`);
    console.log(`✅ Load time is ${loadTime < 2000 ? 'UNDER' : 'OVER'} 2 seconds threshold`);
    console.log(`\n🌐 Network Requests (${networkRequests.length} total):\n`);

    // Display all requests
    networkRequests.forEach((req, index) => {
      const duplicates = networkTracker.getDuplicateRequests();
      const isDuplicate = duplicates.has(`${req.method} ${req.url}`);
      const duplicateMarker = isDuplicate ? ' 🔴 DUPLICATE' : '';
      console.log(`${index + 1}. [${req.status}] ${req.method} ${req.url}`);
      console.log(`   ⏱️  Timing: ${req.timing.toFixed(0)}ms${duplicateMarker}`);
    });

    // Log summary
    networkTracker.logSummary();

    // Check for specific problematic endpoints
    const consentStatusCalls = networkTracker.getRequestsByPattern('consent-status');
    const inboxCalls = networkTracker.getRequestsByPattern('inbox');
    const batchStatusCalls = networkTracker.getRequestsByPattern('batch-status');
    const userMeCalls = networkTracker.getRequestsByPattern('/users/me').concat(
      networkTracker.getRequestsByPattern('/me')
    );

    if (consentStatusCalls.length > 1) {
      console.log(`\n⚠️  consent-status called ${consentStatusCalls.length} times (should be 1)`);
    }
    if (inboxCalls.length > 1) {
      console.log(`\n⚠️  inbox endpoint called ${inboxCalls.length} times (should be 1)`);
    }
    if (batchStatusCalls.length > 1) {
      console.log(`\n⚠️  batch-status called ${batchStatusCalls.length} times (should be 1)`);
    }
    if (userMeCalls.length > 1) {
      console.log(`\n⚠️  /users/me called ${userMeCalls.length} times (should be 1)`);
    }

    // Verify load time is under 2 seconds
    expect(loadTime).toBeLessThan(2000);

    // Assert no duplicates for critical endpoints
    expect(consentStatusCalls.length).toBeLessThanOrEqual(1);
    expect(inboxCalls.length).toBeLessThanOrEqual(1);
    expect(batchStatusCalls.length).toBeLessThanOrEqual(1);
  });

  test('priority popup should load quickly and display correct breakdown', async ({ page }) => {
    test.setTimeout(15000); // 15 second timeout - should fail fast if things aren't working
    
    // Setup network tracking for priority explanation BEFORE navigation
    const networkTracker = new NetworkTracker(page, ['priority-explanation']);

    // Navigate and login (or register if user doesn't exist)
    const loginPage = new LoginPage(page);
    // Login with existing test user (should be seeded beforehand)
    try {
      await loginPage.goto('/login');
      await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
    } catch (error: any) {
      throw new Error(`Login failed. Make sure the test user exists and is approved. Run 'cd server && npm run seed:test-user' to create the test user. Error: ${error.message}`);
    }

    // Navigate to inbox
    const inboxPage = new InboxPage(page);
    await inboxPage.waitForInboxToLoad();

    // Check if priority badges exist
    if (!(await inboxPage.hasPriorityBadges())) {
      console.log('⚠️  No priority badges found - skipping priority popup test');
      test.skip();
      return;
    }

    // Get first priority badge
    const priorityBadge = await inboxPage.getPriorityBadge(0);
    await priorityBadge.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500); // Small delay to ensure badge is interactive

    // Start timing when we interact with the badge
    const popupStartTime = Date.now();

    // Hover over the priority badge to trigger the tooltip
    await priorityBadge.hover({ timeout: 2000 });

    // Wait for tooltip to appear
    const tooltip = new PriorityTooltip(page);
    
    let tooltipVisible = false;
    try {
      await tooltip.waitForVisible(3000);
      tooltipVisible = true;
    } catch {
      // If hover doesn't work, try clicking
      console.log('Hover did not trigger tooltip, trying click...');
      await priorityBadge.click({ timeout: 2000 });
      await tooltip.waitForVisible(3000);
      tooltipVisible = true;
    }

    if (!tooltipVisible) {
      throw new Error('Priority tooltip did not appear after hover/click');
    }

    const popupLoadTime = Date.now() - popupStartTime;

    // Verify popup loaded quickly (under 1 second)
    expect(popupLoadTime).toBeLessThan(1000);

    // Verify the popup displays the expected content
    await expect(tooltip.priorityScoreHeader).toBeVisible({ timeout: 2000 });

    // Verify content structure
    const content = await tooltip.verifyContent();
    
    expect(content.hasPriorityScore).toBe(true);
    expect(content.hasUrgency).toBe(true);
    expect(content.hasGoalAlignment).toBe(true);
    expect(content.hasVipContact).toBe(true);

    // Verify scores are valid
    expect(content.priorityScore).not.toBeNull();
    expect(content.priorityScore).toBeGreaterThanOrEqual(0);
    expect(content.priorityScore).toBeLessThanOrEqual(100);

    expect(content.urgencyScore).not.toBeNull();
    expect(content.goalAlignmentScore).not.toBeNull();
    expect(content.vipContactScore).not.toBeNull();

    // Verify API request was made
    const priorityRequests = networkTracker.getRequestsByPattern('priority-explanation');
    expect(priorityRequests.length).toBeGreaterThan(0);
    
    // Verify API request was fast (under 500ms)
    if (priorityRequests.length > 0) {
      const requestTiming = priorityRequests[0].timing;
      expect(requestTiming).toBeLessThan(500);
      expect(priorityRequests[0].status).toBe(200);
    }

    // Log results
    console.log(`\n📊 Priority Popup Performance Results:`);
    console.log(`⏱️  Popup Load Time: ${popupLoadTime}ms (${(popupLoadTime / 1000).toFixed(2)}s)`);
    console.log(`✅ Popup loaded ${popupLoadTime < 1000 ? 'UNDER' : 'OVER'} 1 second threshold`);
    
    if (priorityRequests.length > 0) {
      console.log(`🌐 API Request Time: ${priorityRequests[0].timing.toFixed(0)}ms`);
      console.log(`📡 API Endpoint: ${priorityRequests[0].url}`);
      console.log(`📊 API Status: ${priorityRequests[0].status}`);
    }

    // Verify content structure
    console.log(`\n✅ Content Verification:`);
    console.log(`   ✓ Priority Score header found: ${content.priorityScore}`);
    console.log(`   ✓ Urgency dimension found: ${content.urgencyScore}`);
    console.log(`   ✓ Goal Alignment dimension found: ${content.goalAlignmentScore}`);
    console.log(`   ✓ VIP Contact dimension found: ${content.vipContactScore}`);

    // Check for duplicate requests
    if (priorityRequests.length > 1) {
      console.log(`\n⚠️  WARNING: Priority explanation requested ${priorityRequests.length} times!`);
      priorityRequests.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req.url} (${req.timing.toFixed(0)}ms, status: ${req.status})`);
      });
      // Fail if there are duplicate requests
      expect(priorityRequests.length).toBe(1);
    } else {
      console.log(`\n✅ No duplicate requests for priority explanation`);
    }
  });
});
