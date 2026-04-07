import { Page, Locator } from '@playwright/test';

/**
 * Page object for the priority tooltip.
 *
 * The React component renders via createPortal to document.body with a
 * `data-priority-tooltip` attribute in ALL states (loading, error, no-data,
 * and full content). This page object uses that attribute as the primary
 * anchor, then drills into content-specific selectors.
 */
export class PriorityTooltip {
  readonly page: Page;

  /** The portal container — visible in loading, error, AND content states. */
  readonly container: Locator;

  /** The "Priority Score: X" header — only visible once data has loaded. */
  readonly priorityScoreHeader: Locator;

  readonly urgencySection: Locator;
  readonly goalAlignmentSection: Locator;
  readonly vipContactSection: Locator;

  constructor(page: Page) {
    this.page = page;

    // Primary locator: the portal div with data-priority-tooltip attribute.
    // This is present in ALL tooltip states (loading, error, no-data, content).
    this.container = page.locator('[data-priority-tooltip]').first();

    // Content-specific locators (only present after data loads)
    this.priorityScoreHeader = this.container.locator('text=/Priority Score/i').first();
    this.urgencySection = this.container.locator('text=/🔥.*Urgency/i');
    this.goalAlignmentSection = this.container.locator('text=/🎯.*Goal Alignment/i');
    this.vipContactSection = this.container.locator('text=/⭐.*VIP Contact/i');
  }

  /**
   * Wait for the tooltip container to appear (any state: loading, error, content).
   */
  async waitForContainer(timeout: number = 8000): Promise<void> {
    await this.container.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the tooltip to show loaded content (Priority Score header visible).
   * Call this AFTER waitForContainer() to wait for data to finish loading.
   */
  async waitForContent(timeout: number = 10000): Promise<void> {
    await this.priorityScoreHeader.waitFor({ state: 'visible', timeout });
  }

  /**
   * Legacy compat: wait for content (same as waitForContent).
   */
  async waitForVisible(timeout: number = 8000): Promise<void> {
    await this.waitForContent(timeout);
  }

  async isContainerVisible(): Promise<boolean> {
    try {
      await this.container.waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async isContentVisible(): Promise<boolean> {
    try {
      await this.priorityScoreHeader.waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async getTextContent(): Promise<string | null> {
    return await this.container.textContent();
  }

  async getPriorityScore(): Promise<number | null> {
    const text = await this.getTextContent();
    const match = text?.match(/Priority Score[:\s]*(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  async getUrgencyScore(): Promise<number | null> {
    const text = await this.getTextContent();
    const match = text?.match(/Urgency[^\d]*?(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  async getGoalAlignmentScore(): Promise<number | null> {
    const text = await this.getTextContent();
    const match = text?.match(/Goal Alignment[^\d]*?(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  async getVipContactScore(): Promise<number | null> {
    const text = await this.getTextContent();
    const match = text?.match(/VIP Contact[^\d]*?(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  async verifyContent(): Promise<{
    hasPriorityScore: boolean;
    hasUrgency: boolean;
    hasGoalAlignment: boolean;
    hasVipContact: boolean;
    priorityScore: number | null;
    urgencyScore: number | null;
    goalAlignmentScore: number | null;
    vipContactScore: number | null;
  }> {
    const text = await this.getTextContent();
    const hasPriorityScore = text?.includes('Priority Score') || false;
    const hasUrgency = /🔥.*Urgency/i.test(text || '');
    const hasGoalAlignment = /🎯.*Goal Alignment/i.test(text || '');
    const hasVipContact = /⭐.*VIP Contact/i.test(text || '');

    return {
      hasPriorityScore,
      hasUrgency,
      hasGoalAlignment,
      hasVipContact,
      priorityScore: await this.getPriorityScore(),
      urgencyScore: await this.getUrgencyScore(),
      goalAlignmentScore: await this.getGoalAlignmentScore(),
      vipContactScore: await this.getVipContactScore(),
    };
  }
}
