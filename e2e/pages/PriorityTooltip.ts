import { Page, Locator } from '@playwright/test';

export class PriorityTooltip {
  readonly page: Page;
  readonly tooltip: Locator;
  readonly priorityScoreHeader: Locator;
  readonly urgencySection: Locator;
  readonly goalAlignmentSection: Locator;
  readonly vipContactSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tooltip = page.locator('[data-priority-tooltip], div:has-text("Priority Score")').first();
    this.priorityScoreHeader = this.tooltip.locator('text=/Priority Score:/i');
    this.urgencySection = this.tooltip.locator('text=/🔥.*Urgency/i');
    this.goalAlignmentSection = this.tooltip.locator('text=/🎯.*Goal Alignment/i');
    this.vipContactSection = this.tooltip.locator('text=/⭐.*VIP Contact/i');
  }

  async waitForVisible(timeout: number = 3000): Promise<void> {
    await this.tooltip.waitFor({ state: 'visible', timeout });
  }

  async isVisible(): Promise<boolean> {
    try {
      await this.tooltip.waitFor({ state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  async getTextContent(): Promise<string | null> {
    return await this.tooltip.textContent();
  }

  async getPriorityScore(): Promise<number | null> {
    const text = await this.getTextContent();
    const match = text?.match(/Priority Score:\s*(\d+)/i);
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

