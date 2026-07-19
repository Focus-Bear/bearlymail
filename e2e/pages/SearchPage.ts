import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class SearchPage extends BasePage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResults: Locator;
  readonly noResultsMessage: Locator;
  readonly queriesTriedSection: Locator;
  readonly rejectedEmailsSection: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    this.searchButton = page.locator('button:has-text("Search"), button[type="submit"]').first();
    this.searchResults = page.locator('[data-testid="search-results"], [data-testid="email-list"]');
    this.noResultsMessage = page.locator('text=/No emails found|No results found/i');
    this.queriesTriedSection = page.locator('text=/queries tried|search queries/i');
    this.rejectedEmailsSection = page.locator('text=/Rejected Emails/i');
    this.loadingIndicator = page.locator('text=/Loading|Searching|Filtering/i');
  }

  async goto() {
    await this.page.goto('/search');
    // Use 'load' rather than 'networkidle': the SPA has background polling
    // (batch-status, etc.) that keeps the network permanently busy in CI,
    // causing 'networkidle' to time out before the search input ever renders.
    await this.page.waitForLoadState('load');
    // Wait for the search input to be present and ready before returning
    await this.searchInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  async waitForResults(timeout: number = 30000) {
    // Wait for loading to complete - either results appear or no-results message
    await Promise.race([
      // Wait for loading indicator to disappear
      this.loadingIndicator.waitFor({ state: 'hidden', timeout }).catch(() => {}),
      // Or wait for results/no-results to appear (specific "No emails found" or "Found N")
      this.page.waitForSelector('text=/No emails found|Found \\d+ email/i', { timeout }).catch(() => {}),
    ]);
    
    // Additional wait to ensure UI has settled
    await this.page.waitForTimeout(2000);
  }

  async getQueriesTried(): Promise<Array<{ query: string; resultCount: number }>> {
    const queries: Array<{ query: string; resultCount: number }> = [];
    
    // Try to find queries tried section
    const section = this.queriesTriedSection.first();
    if (await section.isVisible().catch(() => false)) {
      // Look for list items or divs containing query information
      const queryItems = this.page.locator('text=/query|from:|subject:/i').all();
      const items = await queryItems;
      
      for (const item of items) {
        const text = await item.textContent().catch(() => '');
        // Try to extract query and result count from text
        // Format might be: "Query: from:jay OR jay (5 results)"
        const match = text.match(/(?:query|Query):\s*(.+?)(?:\s*\((\d+)\s*results?\))?/i);
        if (match) {
          queries.push({
            query: match[1].trim(),
            resultCount: match[2] ? parseInt(match[2], 10) : 0,
          });
        }
      }
    }
    
    // Alternative: Check for queries in a structured format (code blocks, lists, etc.)
    const codeBlocks = this.page.locator('code, pre').all();
    const blocks = await codeBlocks;
    for (const block of blocks) {
      const text = await block.textContent().catch(() => '');
      if (text && (text.includes('from:') || text.includes('subject:') || text.includes('OR'))) {
        // This might be a Gmail query
        const resultText = await block.locator('..').textContent().catch(() => '');
        const resultMatch = resultText?.match(/(\d+)\s*results?/i);
        queries.push({
          query: text.trim(),
          resultCount: resultMatch ? parseInt(resultMatch[1], 10) : 0,
        });
      }
    }
    
    return queries;
  }

  async getRejectedEmails(): Promise<Array<{
    from: string;
    subject: string;
    score: number;
    reason?: string;
  }>> {
    const rejected: Array<{ from: string; subject: string; score: number; reason?: string }> = [];
    
    if (await this.rejectedEmailsSection.isVisible().catch(() => false)) {
      // Find all rejected email items
      const emailItems = this.page.locator('[data-testid="rejected-email"], .rejected-email').all();
      const items = await emailItems;
      
      for (const item of items) {
        const from = await item.locator('text=/from|From:/i').textContent().catch(() => '');
        const subject = await item.locator('text=/subject|Subject:/i').textContent().catch(() => '');
        const scoreText = await item.locator('text=/score|Score:/i').textContent().catch(() => '');
        const scoreMatch = scoreText?.match(/(\d+)/);
        const reason = await item.locator('text=/reason|Reason:/i').textContent().catch(() => undefined);
        
        rejected.push({
          from: from?.replace(/from:?/i, '').trim() || '',
          subject: subject?.replace(/subject:?/i, '').trim() || '',
          score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
          reason: reason?.replace(/reason:?/i, '').trim(),
        });
      }
    }
    
    return rejected;
  }

  async getResultsCount(): Promise<number> {
    // First try: parse the "Found N email(s)" count summary rendered by SearchResults
    const foundText = await this.page.locator('text=/Found \\d+ email/i').first().textContent().catch(() => null);
    if (foundText) {
      const match = foundText.match(/(\d+)/);
      if (match) {
        const count = parseInt(match[1], 10);
        if (count > 0) return count;
      }
    }

    // Fallback: count email items in results using common test-id / class selectors
    const emailItems = await this.page.locator(
      '[data-testid="email-item"], .email-item, [data-email-id]'
    ).all();
    return emailItems.length;
  }

  async getNoResultsMessage(): Promise<string | null> {
    // Use .first() to avoid strict mode failure when multiple elements match
    const el = this.noResultsMessage.first();
    if (await el.isVisible().catch(() => false)) {
      return await el.textContent();
    }
    return null;
  }

  async clickScoreBreakdown(emailIndex: number = 0) {
    // Find relevance score elements (they should be clickable)
    const scoreElements = this.page.locator('[data-testid="relevance-score"], .relevance-score, text=/score|Score:/i').all();
    const elements = await scoreElements;
    
    if (elements[emailIndex]) {
      await elements[emailIndex].click();
      // Wait for modal to appear
      await this.page.waitForSelector('[data-testid="score-breakdown-modal"], .score-breakdown-modal, text=/Base Relevance|Recency Adjustment/i', { timeout: 5000 }).catch(() => {});
    }
  }

  async getScoreBreakdown(): Promise<{
    baseRelevanceScore: number;
    recencyAdjustment: number;
    finalScore: number;
    rejectionReason?: string;
  } | null> {
    // Check if score breakdown modal is visible
    const modal = this.page.locator('[data-testid="score-breakdown-modal"], .score-breakdown-modal').first();
    if (await modal.isVisible().catch(() => false)) {
      const baseText = await modal.locator('text=/Base Relevance/i').textContent().catch(() => '');
      const recencyText = await modal.locator('text=/Recency Adjustment/i').textContent().catch(() => '');
      const finalText = await modal.locator('text=/Final Score/i').textContent().catch(() => '');
      const reasonText = await modal.locator('text=/Rejection Reason|Reason:/i').textContent().catch(() => undefined);
      
      const baseMatch = baseText?.match(/(\d+)/);
      const recencyMatch = recencyText?.match(/([+-]?\d+)/);
      const finalMatch = finalText?.match(/(\d+)/);
      
      return {
        baseRelevanceScore: baseMatch ? parseInt(baseMatch[1], 10) : 0,
        recencyAdjustment: recencyMatch ? parseInt(recencyMatch[1], 10) : 0,
        finalScore: finalMatch ? parseInt(finalMatch[1], 10) : 0,
        rejectionReason: reasonText?.replace(/Rejection Reason:?/i, '').trim(),
      };
    }
    
    return null;
  }

  async closeScoreBreakdownModal() {
    const closeButton = this.page.locator('button:has-text("Close"), button[aria-label*="close" i], [data-testid="close-modal"]').first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }
  }
}






