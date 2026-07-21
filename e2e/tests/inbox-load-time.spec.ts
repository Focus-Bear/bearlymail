import { test, expect, Response } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InboxPage } from '../pages/InboxPage';
import { PriorityTooltip } from '../pages/PriorityTooltip';
import { NetworkTracker } from '../utils/NetworkTracker';
import { dismissDistractionGate } from '../utils/distractionGate';
import { API_BASE, TEST_EMAIL, TEST_PASSWORD } from '../utils/config';

// API_URL removed — use shared API_BASE from config (was :3005, correct port is :3001)
const TEST_NAME = process.env.TEST_NAME || 'Test User';

test.describe('Inbox Load Performance', () => {
  test('inbox should load in under 2 seconds and track network requests', async ({ page }) => {
    // Bumped from 15s: login dismisses the distraction gate, then we reload and
    // dismiss it a second time (two 30-tap taxes) before the measured window.
    test.setTimeout(45000);

    // Setup network tracking BEFORE navigation
    const networkTracker = new NetworkTracker(page, [
      API_BASE,
      '/api/',
      '/users/',
      '/emails/',
      '/context',
      '/priority/',
    ]);

    // Navigate to login page
    const loginPage = new LoginPage(page);
    try {
      await loginPage.goto('/login');
    } catch (error) {
      throw new Error(`Failed to navigate to login page. Make sure the app is running on ${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}. Error: ${error}`);
    }

    // Login — LoginPage.login() authenticates, lands on /inbox, and dismisses the
    // Triage distraction gate (its shared chokepoint). We deliberately do NOT
    // measure this first, auth-redirect-laden load; we reload below for a clean,
    // representative steady-state inbox render.
    try {
      await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
    } catch (error: any) {
      throw new Error(`Login failed. Make sure the test user exists and is approved. Run 'cd server && npm run seed:test-user' to create the test user. Error: ${error.message}`);
    }
    await page.waitForURL('**/inbox**', { timeout: 10000 });

    const inboxPage = new InboxPage(page);

    // ── Clean steady-state measurement ───────────────────────────────────────
    //
    // The distraction gate is part of every fresh inbox render for the seed user
    // (it has Action/Follow-Up work) and RE-LOCKS on reload. A gated inbox load
    // fires /emails/inbox TWICE by design: once at the High-priority floor while
    // gated, then again for all tiers when the tax is paid (Inbox.tsx
    // completeUnlock → fetchEmails + fetchPriorityCounts). So the "≤1 call" guards
    // can no longer be asserted over the whole load without weakening them.
    //
    // To keep the guards meaningful we reload for a fresh render, then:
    //   • capture the gated-phase batch-status / consent-status counts (the gate
    //     does NOT add these — they must still fire ≤1), and
    //   • reset the tracker + start the timer right before the final unlock tap,
    //     so /emails/inbox and the <2s load time are measured only for the real
    //     post-unlock steady-state load (the gate is excluded from the window).
    networkTracker.reset();
    await page.reload();

    // Filled in by the onBeforeFinalTap hook, which fires between the last taxing
    // tap and the unlock tap that triggers the post-unlock inbox fetch. Held in an
    // object so the hook's assignments are observed by the outer scope (a closure-
    // assigned `let` would keep its initializer type here).
    const measurement: {
      inboxResponsePromise: Promise<Response> | null;
      startTime: number;
      gatedBatchStatusCount: number;
      gatedConsentStatusCount: number;
      gatedUserMeCount: number;
    } = {
      inboxResponsePromise: null,
      startTime: 0,
      gatedBatchStatusCount: 0,
      gatedConsentStatusCount: 0,
      gatedUserMeCount: 0,
    };

    await dismissDistractionGate(page, {
      onBeforeFinalTap: () => {
        // Gated-phase requests fired while the gate was up — capture BEFORE the
        // reset so their ≤1 guards remain meaningful.
        measurement.gatedBatchStatusCount = networkTracker.getRequestsByPattern('batch-status').length;
        measurement.gatedConsentStatusCount = networkTracker.getRequestsByPattern('consent-status').length;
        measurement.gatedUserMeCount = networkTracker.getRequestsByPattern('/users/me').concat(
          networkTracker.getRequestsByPattern('/me'),
        ).length;
        // Listen for the POST-UNLOCK inbox fetch (all tiers → returns the full
        // seeded inbox incl. canaries, regardless of the gated priority floor).
        measurement.inboxResponsePromise = page.waitForResponse(
          (response) => response.url().includes('/emails/inbox') && !response.url().includes('/emails/inbox-summary'),
          { timeout: 20000 },
        );
        // Reset so the measured window contains ONLY the post-unlock load.
        networkTracker.reset();
        measurement.startTime = Date.now();
      },
    });

    // The final tap fired the post-unlock inbox fetch — await + validate it.
    const inboxResponsePromise = measurement.inboxResponsePromise;
    if (!inboxResponsePromise) {
      throw new Error(
        'Distraction gate never appeared on reload — the seed user must have Action/Follow-Up work so the gate (and its post-unlock inbox fetch) render. ' +
          'Ensure `npm run seed:test-user` seeded the action + follow-up canaries.',
      );
    }
    const inboxResponse = await inboxResponsePromise;

    if (inboxResponse.status() !== 200) {
      throw new Error(`/emails/inbox returned HTTP ${inboxResponse.status()} — expected 200. Ensure GmailRequiredGuard is bypassed (CI=true NODE_ENV=test) and the test user is seeded with emails.`);
    }

    let inboxEmailCount: number | null = null;
    try {
      const inboxBody = await inboxResponse.text();
      const inboxData = JSON.parse(inboxBody);
      inboxEmailCount = Array.isArray(inboxData?.emails) ? inboxData.emails.length : null;
      console.log(`Inbox email count: ${inboxEmailCount}`);
    } catch (e) {
      console.log(`Could not parse inbox response: ${e}`);
    }
    if (inboxEmailCount === 0) {
      throw new Error('/emails/inbox returned 0 emails — test user seed is missing email data. Run \'npm run seed:test-user\' to seed emails.');
    }

    // Wait for inbox content to render after the post-unlock fetch (fast once the
    // gate is gone and the all-tiers data has arrived).
    await inboxPage.waitForInboxToLoad(5000);
    const loadTime = Date.now() - measurement.startTime;

    // Get network requests BEFORE assertion so we can see them even if test fails.
    // This window covers ONLY the post-unlock steady-state load (tracker was reset
    // just before the final unlock tap).
    const networkRequests = networkTracker.getRequests();
    // 2000ms threshold — measured from the final unlock tap (gate dismissed) to
    // the inbox rendering the post-unlock (all-tiers) result. The gate friction
    // itself is NOT part of this window; this is the inbox's real steady-state
    // render latency.
    const loadThreshold = 2000;

    // Log the results (do this before assertion so we see it even on failure)
    console.log(`\n📊 Inbox Load Performance Results:`);
    console.log(`⏱️  Load Time: ${loadTime}ms (${(loadTime / 1000).toFixed(2)}s)`);
    console.log(`✅ Load time is ${loadTime < loadThreshold ? 'UNDER' : 'OVER'} ${loadThreshold}ms threshold`);
    console.log(`\n🌐 Network Requests (${networkRequests.length} total in post-unlock window):\n`);

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

    // consent-status / batch-status / users-me are gate-independent and fire in
    // the gated phase, so they are counted from BEFORE the reset (captured in the
    // hook). /emails/inbox is measured over the post-unlock window and must fire
    // exactly once for the steady-state load.
    const consentStatusCalls = measurement.gatedConsentStatusCount;
    // Use '/emails/inbox?' to match only the inbox page endpoint, not inbox-summary
    const inboxCalls = networkTracker.getRequestsByPattern('/emails/inbox?').length;
    const batchStatusCalls = measurement.gatedBatchStatusCount;
    const userMeCalls = measurement.gatedUserMeCount;

    if (consentStatusCalls > 1) {
      console.log(`\n⚠️  consent-status called ${consentStatusCalls} times (should be 1)`);
    }
    if (inboxCalls > 1) {
      console.log(`\n⚠️  inbox endpoint called ${inboxCalls} times in the post-unlock window (should be 1)`);
    }
    if (batchStatusCalls > 1) {
      console.log(`\n⚠️  batch-status called ${batchStatusCalls} times (should be 1)`);
    }
    if (userMeCalls > 1) {
      console.log(`\n⚠️  /users/me called ${userMeCalls} times (should be 1)`);
    }

    expect(loadTime).toBeLessThan(loadThreshold);

    // Assert no duplicates for critical endpoints
    expect(consentStatusCalls).toBeLessThanOrEqual(1);
    expect(inboxCalls).toBeLessThanOrEqual(1);
    expect(batchStatusCalls).toBeLessThanOrEqual(1);
  });

  test('priority popup should load quickly and display correct breakdown', async ({ page }) => {
    // Bumped from 10s: LoginPage.login() now also pays the 30-tap distraction-gate
    // tax before the inbox is interactive, so the badge click is no longer
    // intercepted by the gate overlay.
    test.setTimeout(30000);

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

    if (!(await inboxPage.hasPriorityBadges())) {
      throw new Error(
        'No priority badges in inbox — expected seeded threads with priorityScore. ' +
          'Run `cd server && npm run seed:test-user` and ensure /emails/inbox returns 200 with emails.',
      );
    }

    // Target a known canary email's priority badge by subject line rather than
    // taking the first badge in the inbox. The first badge may belong to a
    // non-canary email whose emailThreadId is still null in some CI DB states
    // (e.g. emails seeded before the resolveThreadForEmail() FK fix), which
    // causes the priority-explanation API to fall back to "Calculating..."
    // placeholders. Canary emails always have their emailThreadId set by the
    // seed script, so they are guaranteed to have valid priorityExplanation data.
    //
    // Subject: '[E2E Canary] Triage visibility' (messageId: ci-canary-triage-001)
    const canarySubjectPattern = /\[E2E Canary\]\s+Triage visibility/i;
    const canaryRow = page.locator('tr, [data-testid*="email"], [class*="email-row"], li').filter({
      has: page.getByText(canarySubjectPattern),
    }).first();

    let priorityBadge = canaryRow.locator('[data-priority-badge]').first();
    const canaryBadgeCount = await priorityBadge.count();

    // Canary email ID resolved via API when DOM nesting fails (virtualised list in CI).
    let canaryEmailIdFromApi: string | null = null;

    if (canaryBadgeCount === 0) {
      // Fallback: the inbox is a virtualised list — the canary row may not be in
      // the DOM subtree we searched. Resolve the canary email ID via the inbox API
      // instead of falling back to the first DOM badge (which may be a non-canary
      // email whose thread has no priorityExplanation, causing "Calculating...").
      console.log('\n⚠️  Could not find canary badge via row nesting. Resolving canary email ID via inbox API.');
      const authTokenForFallback = await page.evaluate(() => localStorage.getItem('token'));
      const fallbackHeaders = authTokenForFallback ? { Authorization: `Bearer ${authTokenForFallback}` } : {};
      const inboxRes = await page.request.get(
        `${API_BASE}/emails/inbox?mode=triage&limit=200&offset=0`,
        { headers: fallbackHeaders },
      );
      if (inboxRes.ok()) {
        const inboxBody = await inboxRes.json();
        const inboxEmails: { id: string; subject?: string }[] = inboxBody?.emails ?? [];
        const canaryEmail = inboxEmails.find(
          (e) => e.subject?.includes('[E2E Canary] Triage visibility'),
        );
        if (canaryEmail) {
          canaryEmailIdFromApi = canaryEmail.id;
          console.log(`\n✅  Resolved canary email ID via API: ${canaryEmailIdFromApi}`);
        }
      }

      if (canaryEmailIdFromApi) {
        // Try to find the canary badge by email ID in the DOM (may or may not be visible
        // in a virtualised list). If visible, use it for the click interaction too.
        const canaryBadgeById = page.locator(`[data-priority-badge="${canaryEmailIdFromApi}"]`);
        const canaryBadgeByIdCount = await canaryBadgeById.count();
        if (canaryBadgeByIdCount > 0) {
          priorityBadge = canaryBadgeById.first();
          console.log(`\n✅  Found canary badge in DOM by email ID: ${canaryEmailIdFromApi}`);
        } else {
          // Badge not in DOM viewport — use first visible badge for the click interaction.
          // The smoke test (priority-explanation API call) uses canaryEmailIdFromApi directly.
          console.log(`\n⚠️  Canary badge not in DOM viewport — click test will use first visible badge.`);
          priorityBadge = await inboxPage.getPriorityBadge(0);
        }
      } else {
        // Last resort: use first visible badge (may produce "Calculating..." if
        // the email has no seeded priorityExplanation on its thread).
        console.log('\n⚠️  Could not resolve canary via API either. Falling back to first badge in inbox.');
        priorityBadge = await inboxPage.getPriorityBadge(0);
      }
    }
    await priorityBadge.waitFor({ state: 'visible', timeout: 5000 });

    // Fix 2B — smoke test: verify the priority-explanation API works for the
    // targeted email BEFORE trying the hover/click interaction.  If this fails,
    // the API endpoint cannot serve seeded data and the tooltip will never render.
    //
    // Prefer the canary email ID resolved via API (avoids non-canary emails that
    // have no priorityExplanation on their thread and always return "Calculating...").
    const firstEmailId = canaryEmailIdFromApi ?? await priorityBadge.getAttribute('data-priority-badge');
    if (firstEmailId) {
      const authToken = await page.evaluate(() => localStorage.getItem('token'));
      const smokeRes = await page.request.get(
        `${API_BASE}/emails/${firstEmailId}/priority-explanation`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );
      const smokeBody = await smokeRes.text().catch(() => '(unreadable)');
      if (smokeRes.status() !== 200) {
        throw new Error(
          `GET /emails/${firstEmailId}/priority-explanation returned HTTP ${smokeRes.status()} — tooltip will never render. Body: ${smokeBody}`,
        );
      }
      let explData: { score?: number; breakdown?: unknown[] } | null = null;
      try {
        explData = JSON.parse(smokeBody) as { score?: number; breakdown?: unknown[] };
      } catch {
        /* non-JSON body */
      }
      const breakdownLen = explData?.breakdown?.length ?? 0;
      if (breakdownLen === 0) {
        throw new Error(
          'priority-explanation returned empty breakdown — tooltip dimensions will not render (prod regression guard).',
        );
      }
      // Guard: fallback must not overwrite seeded data with "Calculating..." placeholders
      const breakdownDescs = (explData?.breakdown ?? []).map(
        (b: { description?: string }) => b.description ?? '',
      );
      const hasCalculating = breakdownDescs.some((d: string) => d.includes('Calculating...'));
      expect(
        hasCalculating,
        `priority-explanation returned "Calculating..." descriptions — computeFallbackExplanation overwrote seeded data. ` +
          `Descriptions: ${JSON.stringify(breakdownDescs)}`,
      ).toBe(false);

      console.log(`\n🔍 Priority explanation smoke test passed (status 200):`);
      console.log(`   Score: ${explData?.score}, breakdown items: ${breakdownLen}`);
    } else {
      throw new Error('Could not read data-priority-badge attribute on first row — cannot verify priority API.');
    }

    // ── Tooltip interaction ──────────────────────────────────────────────────
    //
    // Architecture (from code review of PriorityBadge.tsx + usePriorityTooltip.ts):
    //
    // 1. PriorityBadge (header variant) uses onClick → togglePriorityTooltip(email.id)
    //    - BUT: onClick early-returns if isEmailPriorityCalculating(email) is true
    //      (when priorityScore === 0 AND no breakdown on the email entity)
    //
    // 2. togglePriorityTooltip is a TOGGLE — second click CLOSES the tooltip.
    //    Never double-click as a "retry". If the first click doesn't work, diagnose why.
    //
    // 3. The tooltip renders via createPortal to document.body with
    //    [data-priority-tooltip=emailId] in ALL states (loading, error, content).
    //
    // 4. The "close on outside click" useEffect fires on mousedown outside
    //    [data-priority-badge] and [data-priority-tooltip].
    //
    // 5. fetchPriorityExplanation calls axios.get(API_URL/emails/:id/priority-explanation)
    //    from the browser. API_URL defaults to http://localhost:3001.

    // Register response listener BEFORE clicking (the hook fires axios.get immediately)
    const priorityExplanationResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/priority-explanation'),
      { timeout: 8000 },
    ).catch(() => null);

    // Click the badge to open the tooltip
    await priorityBadge.scrollIntoViewIfNeeded();
    await priorityBadge.click({ force: true });

    const tooltip = new PriorityTooltip(page);

    // Step 1: Wait for tooltip CONTAINER (any state: loading, error, or content).
    // [data-priority-tooltip] is present in PriorityTooltipContainer AND PriorityTooltipLoading.
    let containerVisible = false;
    try {
      await tooltip.waitForContainer(5000);
      containerVisible = true;
    } catch {
      // Container didn't appear — the click didn't trigger togglePriorityTooltip
    }

    if (!containerVisible) {
      // Diagnose: is the email stuck in "calculating" state?
      const badgeText = await priorityBadge.textContent();
      const emailId = await priorityBadge.getAttribute('data-priority-badge');
      const isCalculating = badgeText?.toLowerCase().includes('calculating');

      if (isCalculating) {
        throw new Error(
          `Priority badge for email ${emailId} shows "${badgeText}" (calculating state). ` +
            'isEmailPriorityCalculating(email) returned true, blocking the onClick handler. ' +
            'This means the inbox API returned priorityScore=0 with no breakdown for this email. ' +
            'Ensure seed-test-user.ts sets priorityScore > 0 on the Email entity.',
        );
      }
      throw new Error(
        `Priority tooltip container [data-priority-tooltip] did not appear after click. ` +
          `Badge text: "${badgeText}", emailId: ${emailId}. ` +
          'The click may have been intercepted by a parent handler or the badge was not interactive.',
      );
    }

    // Step 2: Wait for the priority-explanation API call to complete
    const explResponse = await priorityExplanationResponsePromise;
    if (explResponse) {
      console.log(`\n🔍 priority-explanation API response: HTTP ${explResponse.status()}`);
    } else {
      console.log('\n⚠️ priority-explanation API response not intercepted (may have been cached or failed silently)');
    }

    // Step 3: Wait for tooltip CONTENT ("Priority Score: X" header)
    // Dump DOM state for diagnostics first
    const tooltipHTML = await page.evaluate(() => {
      const el = document.querySelector('[data-priority-tooltip]');
      return el ? el.innerHTML.slice(0, 800) : '(tooltip element not found in DOM)';
    });
    console.log(`\n🔍 Tooltip DOM after API response:\n${tooltipHTML}`);

    let contentVisible = false;
    try {
      await tooltip.waitForContent(8000);
      contentVisible = true;
    } catch {
      // Content header didn't appear — stuck in loading, error, or no-data state
    }

    if (!contentVisible) {
      const tooltipText = await tooltip.getTextContent();
      const isLoading = tooltipText?.toLowerCase().includes('loading');
      const isError = tooltipText?.toLowerCase().includes('error') || tooltipText?.toLowerCase().includes('retry');

      if (isLoading) {
        throw new Error(
          'Priority tooltip stuck in loading state — fetchPriorityExplanation likely timed out ' +
            'or the API at http://localhost:3001 is unreachable from the browser. ' +
            `Tooltip text: "${tooltipText}"`,
        );
      }
      if (isError) {
        throw new Error(
          'Priority tooltip shows error state — the priority-explanation API call failed. ' +
            `Tooltip text: "${tooltipText}"`,
        );
      }
      throw new Error(
        'Priority tooltip container is visible but "Priority Score" content did not render. ' +
          `Tooltip text: "${tooltipText}"`,
      );
    }

    // Step 4: Verify content structure and scores
    const popupStartTime = Date.now();
    await expect(tooltip.priorityScoreHeader).toBeVisible({ timeout: 3000 });
    const popupLoadTime = Date.now() - popupStartTime;

    const content = await tooltip.verifyContent();

    expect(content.hasPriorityScore).toBe(true);
    expect(content.hasUrgency).toBe(true);
    expect(content.hasGoalAlignment).toBe(true);
    expect(content.hasVipContact).toBe(true);

    expect(content.priorityScore).not.toBeNull();
    expect(content.priorityScore).toBeGreaterThanOrEqual(0);
    expect(content.priorityScore).toBeLessThanOrEqual(100);

    expect(content.urgencyScore).not.toBeNull();
    expect(content.goalAlignmentScore).not.toBeNull();
    expect(content.vipContactScore).not.toBeNull();

    // Step 5: Verify API request was made and was fast
    const priorityRequests = networkTracker.getRequestsByPattern('priority-explanation');
    expect(priorityRequests.length).toBeGreaterThan(0);

    if (priorityRequests.length > 0) {
      expect(priorityRequests[0].timing).toBeLessThan(500);
      expect(priorityRequests[0].status).toBe(200);
    }

    // Log results
    console.log(`\n📊 Priority Popup Performance Results:`);
    console.log(`⏱️  Popup Content Render Time: ${popupLoadTime}ms`);
    if (priorityRequests.length > 0) {
      console.log(`🌐 API Request Time: ${priorityRequests[0].timing.toFixed(0)}ms`);
      console.log(`📡 API Status: ${priorityRequests[0].status}`);
    }

    console.log(`\n✅ Content Verification:`);
    console.log(`   ✓ Priority Score: ${content.priorityScore}`);
    console.log(`   ✓ Urgency: ${content.urgencyScore}`);
    console.log(`   ✓ Goal Alignment: ${content.goalAlignmentScore}`);
    console.log(`   ✓ VIP Contact: ${content.vipContactScore}`);

    expect(popupLoadTime).toBeLessThan(1000);

    // Check for duplicate requests
    if (priorityRequests.length > 1) {
      console.log(`\n⚠️  WARNING: Priority explanation requested ${priorityRequests.length} times!`);
      priorityRequests.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req.url} (${req.timing.toFixed(0)}ms, status: ${req.status})`);
      });
      expect(priorityRequests.length).toBe(1);
    } else {
      console.log(`\n✅ No duplicate requests for priority explanation`);
    }
  });
});
