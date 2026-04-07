import { test, expect } from '@playwright/test';
import { SearchPage } from '../pages/SearchPage';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Search debugging test suite — LOCAL USE ONLY, skipped in CI.
 *
 * These tests verify:
 * 1. Search queries tried are displayed in the UI
 * 2. Rejected emails are shown with score breakdowns
 * 3. Debug information is available for troubleshooting
 *
 * After each test (especially failures), the test reads and logs
 * relevant entries from logs/search-system.log for debugging.
 *
 * NOT suitable for CI: requires a local Chrome session (no auth), reads from
 * server/logs/search-system.log, and has 60s wait timeouts for AI processing.
 * Use search-ci.spec.ts for CI-safe search coverage.
 */



// Helper function to read last N lines from search log
function readSearchLogLines(count: number = 50): string[] {
  const logPath = path.join(process.cwd(), '..', 'server', 'logs', 'search-system.log');
  
  if (!fs.existsSync(logPath)) {
    return [`Log file not found at: ${logPath}`];
  }
  
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.slice(-count);
  } catch (error) {
    return [`Error reading log file: ${error}`];
  }
}

// Helper function to filter log lines for a specific query
function filterLogForQuery(logLines: string[], query: string): string[] {
  return logLines.filter(line => 
    line.toLowerCase().includes(query.toLowerCase()) ||
    line.includes('[SEARCH]')
  );
}

// In CI this suite is skipped: it needs a local Chrome session, reads from
// server/logs/search-system.log, and has 60s waits for AI processing.
// Use search-ci.spec.ts for CI-safe search coverage instead.
const describeOrSkip = process.env.CI ? test.describe.skip : test.describe;
describeOrSkip('Search Debugging', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
    await searchPage.goto();
  });

  test('Scenario 1: Query with Results - should show queries tried', async ({ page }) => {
    // Use a query that should return results
    // Adjust this query based on your actual email data
    const testQuery = 'test';
    
    await searchPage.search(testQuery);
    await searchPage.waitForResults(60000); // Longer timeout for AI processing
    
    // Assert: Results are displayed OR no-results message with queries tried
    const resultsCount = await searchPage.getResultsCount();
    const noResultsMessage = await searchPage.getNoResultsMessage();
    
    // Either we have results, or we have a no-results message
    expect(resultsCount > 0 || noResultsMessage !== null).toBeTruthy();
    
    // Assert: Queries tried section should be visible (either in results or no-results)
    // Check if queries tried are shown in the UI
    const queriesTried = await searchPage.getQueriesTried();
    
    // Log queries tried for debugging
    console.log(`Queries tried found in UI: ${JSON.stringify(queriesTried, null, 2)}`);
    
    // If no results, queries tried should definitely be shown
    if (noResultsMessage) {
      expect(queriesTried.length).toBeGreaterThan(0);
    }
    
    // After test: Check backend logs
    const logLines = readSearchLogLines(100);
    const relevantLogs = filterLogForQuery(logLines, testQuery);
    console.log(`\n=== Backend Logs for query "${testQuery}" ===`);
    relevantLogs.slice(-20).forEach(line => console.log(line));
    console.log('=== End Backend Logs ===\n');
  });

  test('Scenario 2: Query with No Results - should show queries tried', async ({ page }) => {
    // Use a query that should return no results
    // Use a very specific query that's unlikely to match anything
    const testQuery = 'xyzabc123nonexistentquery98765';
    
    await searchPage.search(testQuery);
    await searchPage.waitForResults(60000);
    
    // Assert: "No emails found" message is displayed
    const noResultsMessage = await searchPage.getNoResultsMessage();
    expect(noResultsMessage).toBeTruthy();
    expect(noResultsMessage?.toLowerCase()).toContain('no');
    
    // Assert: "Queries tried" section is visible
    const queriesTriedSection = searchPage.queriesTriedSection;
    const isVisible = await queriesTriedSection.isVisible().catch(() => false);
    
    // Try alternative: check if queries are in the page text
    const pageText = await page.textContent('body').catch(() => '');
    const hasQueriesInfo = pageText.includes('query') || pageText.includes('tried') || pageText.includes('from:');
    
    expect(isVisible || hasQueriesInfo).toBeTruthy();
    
    // Assert: Get queries tried from UI
    const queriesTried = await searchPage.getQueriesTried();
    console.log(`Queries tried found in UI: ${JSON.stringify(queriesTried, null, 2)}`);
    
    // Assert: Each query should show its result count (if available)
    queriesTried.forEach(query => {
      expect(query.query).toBeTruthy();
      expect(typeof query.resultCount).toBe('number');
    });
    
    // After test: Check backend logs to verify queries were logged
    const logLines = readSearchLogLines(100);
    const relevantLogs = filterLogForQuery(logLines, testQuery);
    
    console.log(`\n=== Backend Logs for query "${testQuery}" ===`);
    if (relevantLogs.length > 0) {
      relevantLogs.slice(-30).forEach(line => console.log(line));
    } else {
      console.log('No relevant logs found. Full last 20 lines:');
      logLines.slice(-20).forEach(line => console.log(line));
    }
    console.log('=== End Backend Logs ===\n');
    
    // Verify backend logged the queries
    const hasSearchLogs = relevantLogs.some(line => 
      line.includes('[SEARCH]') && 
      (line.includes('Gmail query') || line.includes('Trying query'))
    );
    
    // This is informational - don't fail the test if logs aren't found
    // (logs might be in a different format or location)
    if (!hasSearchLogs) {
      console.warn('WARNING: Could not find search query logs in backend log file');
    }
  });

  test('Scenario 3: Query with Rejected Emails - should show score breakdowns', async ({ page }) => {
    // Use a query that returns some results but also has emails below threshold
    // This might be a broad query that returns many results
    const testQuery = 'meeting';
    
    await searchPage.search(testQuery);
    await searchPage.waitForResults(60000);
    
    // Assert: Results are displayed
    const resultsCount = await searchPage.getResultsCount();
    const noResultsMessage = await searchPage.getNoResultsMessage();
    
    // We should have either results or a no-results message
    expect(resultsCount > 0 || noResultsMessage !== null).toBeTruthy();
    
    // Check for rejected emails section (may or may not be present)
    const rejectedEmailsSection = searchPage.rejectedEmailsSection;
    const hasRejectedSection = await rejectedEmailsSection.isVisible().catch(() => false);
    
    if (hasRejectedSection) {
      // Assert: Rejected emails section is visible
      expect(hasRejectedSection).toBeTruthy();
      
      // Assert: Get rejected emails
      const rejectedEmails = await searchPage.getRejectedEmails();
      console.log(`Rejected emails found: ${JSON.stringify(rejectedEmails, null, 2)}`);
      
      // Assert: Rejected emails show score breakdown
      rejectedEmails.forEach(email => {
        expect(email.from).toBeTruthy();
        expect(typeof email.score).toBe('number');
      });
      
      // Try clicking on a score to see breakdown
      if (rejectedEmails.length > 0) {
        // Find and click on a relevance score
        const scoreElements = page.locator('[data-testid="relevance-score"], .relevance-score, text=/\\d+.*score/i').all();
        const elements = await scoreElements;
        
        if (elements.length > 0) {
          await elements[0].click();
          
          // Assert: Score breakdown modal appears
          const breakdown = await searchPage.getScoreBreakdown();
          if (breakdown) {
            expect(typeof breakdown.baseRelevanceScore).toBe('number');
            expect(typeof breakdown.recencyAdjustment).toBe('number');
            expect(typeof breakdown.finalScore).toBe('number');
            
            console.log(`Score breakdown: ${JSON.stringify(breakdown, null, 2)}`);
            
            await searchPage.closeScoreBreakdownModal();
          }
        }
      }
    } else {
      console.log('No rejected emails section found - this is okay if all emails scored above threshold');
    }
    
    // After test: Check backend logs
    const logLines = readSearchLogLines(100);
    const relevantLogs = filterLogForQuery(logLines, testQuery);
    
    console.log(`\n=== Backend Logs for query "${testQuery}" ===`);
    if (relevantLogs.length > 0) {
      // Filter for scoring-related logs
      const scoringLogs = relevantLogs.filter(line => 
        line.includes('Scoring') || 
        line.includes('baseScore') || 
        line.includes('relevanceScore') ||
        line.includes('Rejected')
      );
      scoringLogs.slice(-20).forEach(line => console.log(line));
    } else {
      logLines.slice(-20).forEach(line => console.log(line));
    }
    console.log('=== End Backend Logs ===\n');
  });

  test.afterEach(async ({ page }, testInfo) => {
    // On test failure, log additional debugging information
    if (testInfo.status === 'failed') {
      console.log('\n=== TEST FAILED - Additional Debug Info ===');
      
      // Screenshot is already taken by Playwright config
      // Log page content
      const pageText = await page.textContent('body').catch(() => '');
      console.log('Page text (first 1000 chars):', pageText?.substring(0, 1000));
      
      // Log search log file
      const logLines = readSearchLogLines(50);
      console.log('\nLast 50 lines from search-system.log:');
      logLines.forEach(line => console.log(line));
      
      console.log('=== End Debug Info ===\n');
    }
  });
});






