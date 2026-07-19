import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class InboxPage extends BasePage {
  readonly priorityBadges: Locator;
  readonly emailList: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    super(page);
    // Use getByText for text matching instead of :has-text with regex
    this.priorityBadges = page.locator('[data-priority-badge]').or(
      page.getByText(/Medium|High|Low|\d+\)/).locator('span')
    );
    this.emailList = page.locator('[data-testid="email-list"]').or(
      page.getByText(/Medium|High|Low/)
    );
    this.loadingIndicator = page.locator('[data-testid="loading"]').or(
      page.getByText(/Loading|Calculating/)
    );
  }

  async waitForInboxToLoad(timeout: number = 5000): Promise<void> {
    // Verify we're on /inbox — callers are responsible for navigating here first.
    // Previously this was a waitForURL('**/inbox', { timeout: 3000 }) that burned
    // 3 000 ms when the glob didn't match query-param URLs (e.g. /inbox?tab=…),
    // then the .catch() silently swallowed the timeout.
    if (!this.page.url().includes('/inbox')) {
      throw new Error(`Not on inbox page. Current URL: ${this.page.url()}`);
    }

    // Wait for loading to stop OR content to appear (whichever comes first)
    // This is the key - we want to detect when the inbox is ready, not wait for specific content
    try {
      await Promise.race([
        // Option 1: Loading text disappears
        this.page.waitForSelector('text=/Loading|Decrypting/', { state: 'hidden', timeout }),
        // Option 2: Content appears (emails, empty state, or priority badges)
        // Matches: "Medium/High/Low" priority badges, "No emails found", "No new emails to triage!",
        // "No emails to process!", "all caught up", "inbox is empty", etc.
        this.page.waitForSelector(
          '[data-priority-badge], text=/Medium|High|Low|No emails|No new|all caught up|empty|inbox is empty/i',
          { timeout }
        ),
        // Option 3: Loading indicator disappears
        this.loadingIndicator.waitFor({ state: 'hidden', timeout })
      ]);
    } catch {
      // If all time out, check if there's an error
      const errorMessage = await this.page.locator('text=/error|failed|authentication/i').first().isVisible().catch(() => false);
      if (errorMessage) {
        const errorText = await this.page.locator('text=/error|failed|authentication/i').first().textContent().catch(() => 'Unknown error');
        throw new Error(`Inbox failed to load: ${errorText}`);
      }
      // If no error, assume it's ready (might be empty inbox)
    }

    // Quick check that we're not still loading
    const stillLoading = await this.page.locator('text=/Loading|Decrypting/').first().isVisible().catch(() => false);
    if (stillLoading) {
      // Wait a bit more for loading to complete
      await this.page.waitForSelector('text=/Loading|Decrypting/', { state: 'hidden', timeout: 2000 }).catch(() => {
        // If still loading after timeout, that's okay - continue
      });
    }
  }

  async getPriorityBadge(index: number = 0): Promise<Locator> {
    // Try data attribute first
    let badge = this.page.locator('[data-priority-badge]').nth(index);
    
    if (await badge.count() === 0) {
      // Fallback to text-based selector
      badge = this.page.locator('span:has-text(/Medium|High|Low/), span:has-text(/\\d+\\)/)').nth(index);
    }

    return badge;
  }

  async getPriorityBadgeCount(): Promise<number> {
    const count = await this.priorityBadges.count();
    return count;
  }

  async hasPriorityBadges(): Promise<boolean> {
    const count = await this.getPriorityBadgeCount();
    return count > 0;
  }
}

