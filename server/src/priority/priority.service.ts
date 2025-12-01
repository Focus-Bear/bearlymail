import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriorityRule, RuleType } from '../database/entities/priority-rule.entity';
import { Email } from '../database/entities/email.entity';
import { LLMService } from '../llm/llm.service';
import * as natural from 'natural';

@Injectable()
export class PriorityService {
  private readonly logger = new Logger(PriorityService.name);

  constructor(
    @InjectRepository(PriorityRule)
    private priorityRuleRepository: Repository<PriorityRule>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private llmService: LLMService,
  ) {}

  // Calculate basic priority score without LLM (fast, synchronous)
  // Accepts optional daysSinceLastEmail for exponential priority boost
  calculateBasicPriorityScore(
    email: Partial<Email>, 
    rules: PriorityRule[], 
    daysSinceLastEmail?: number
  ): number {
    let baseScore = 50;
    
    // Apply explicit rules first
    const explicitRules = rules.filter((r) => r.ruleType === RuleType.EXPLICIT_SENDER);
    for (const rule of explicitRules) {
      if (this.matchesCondition(email, rule.conditionKey, rule.conditionVal)) {
        baseScore += rule.priorityBoost;
      }
    }

    // Rule-based calculation (no LLM)
    const implicitRules = rules.filter((r) => r.ruleType === RuleType.IMPLICIT_BEHAVIOR);
    
    // Sentiment analysis
    const sentimentScore = this.analyzeSentiment(email.body || '');
    const sentimentWeight = this.getWeight(implicitRules, 'sentiment');
    baseScore += sentimentWeight * sentimentScore * 20;

    // Job title score
    const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle || '');
    const titleWeight = this.getWeight(implicitRules, 'title');
    baseScore += titleWeight * jobTitleScore * 15;

    // Time to reply (if available from history)
    if (email.timeToReply) {
      const timeWeight = this.getWeight(implicitRules, 'time');
      const normalizedTime = Math.max(0, Math.min(1, 1 - email.timeToReply / 168));
      baseScore += timeWeight * normalizedTime * 15;
    }

    // Days since last email - exponential increase in priority the longer it's been
    // This factor encourages replying to older conversations that may have been forgotten
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 0) {
      // Exponential boost: 1 day = +2, 2 days = +4, 3 days = +8, 7 days = +15, 14 days = +25, 30 days = +30 (capped)
      // Formula: min(30, 2 * (daysSinceLastEmail^1.5))
      const daysBoost = Math.min(30, 2 * Math.pow(daysSinceLastEmail, 1.5));
      baseScore += daysBoost;
    }

    // Urgent keywords boost
    if (this.checkIfUrgent(email)) {
      baseScore += 20;
    }

    // Ensure score is between 0-100
    return Math.max(0, Math.min(100, baseScore));
  }

  private checkIfUrgent(email: Partial<Email>): boolean {
    const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate'];
    const subjectLower = (email.subject || '').toLowerCase();
    const bodyLower = (email.body || '').toLowerCase();
    return urgentKeywords.some((keyword) => 
      subjectLower.includes(keyword) || bodyLower.includes(keyword)
    );
  }

  async calculatePriorityScore(
    userId: string,
    email: Partial<Email>,
    useLLM: boolean = true,
    provider?: 'gemini' | 'openai',
  ): Promise<number> {
    // Get all priority rules for the user
    const rules = await this.priorityRuleRepository.find({
      where: { userId },
    });

    // Return basic score immediately (fast, no LLM)
    return this.calculateBasicPriorityScore(email, rules);
  }

  // Queue LLM-based priority refinement (async)
  async queueLLMPriorityRefinement(
    userId: string,
    emailId: string,
    provider?: 'gemini' | 'openai',
  ): Promise<void> {
    // This will be called from a background job processor
    // For now, we'll just mark it as processing
    // The actual LLM call will happen in the processor
  }

  private matchesCondition(email: Partial<Email>, key: string, value: string): boolean {
    switch (key) {
      case 'sender_domain':
        return email.from?.includes(value) || false;
      case 'subject_keyword':
        return email.subject?.toLowerCase().includes(value.toLowerCase()) || false;
      case 'sender_job_title':
        return email.senderJobTitle?.toLowerCase().includes(value.toLowerCase()) || false;
      default:
        return false;
    }
  }

  private analyzeSentiment(text: string): number {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    
    // Simple sentiment analysis using positive/negative word lists
    const positiveWords = ['urgent', 'important', 'asap', 'critical', 'deadline', 'meeting', 'action'];
    const negativeWords = ['no rush', 'whenever', 'optional', 'low priority'];
    
    let score = 0;
    tokens.forEach((token) => {
      if (positiveWords.some((w) => token.includes(w))) score += 1;
      if (negativeWords.some((w) => token.includes(w))) score -= 1;
    });
    
    // Normalize to -1 to 1
    return Math.max(-1, Math.min(1, score / 10));
  }

  private calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;
    
    const highPriorityTitles = ['ceo', 'president', 'director', 'manager', 'lead', 'head'];
    const titleLower = jobTitle.toLowerCase();
    
    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return 1;
    }
    
    return 0.5;
  }

  private getWeight(rules: PriorityRule[], factor: string): number {
    const rule = rules.find((r) => r.conditionKey === `weight_${factor}`);
    return rule ? parseFloat(rule.conditionVal) || 0.5 : 0.5;
  }

  async getPriorityRules(userId: string): Promise<PriorityRule[]> {
    return this.priorityRuleRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async createPriorityRule(userId: string, rule: Partial<PriorityRule>): Promise<PriorityRule> {
    const newRule = this.priorityRuleRepository.create({
      ...rule,
      userId,
    });
    return this.priorityRuleRepository.save(newRule);
  }

  async updatePriorityRule(ruleId: string, userId: string, updates: Partial<PriorityRule>): Promise<PriorityRule> {
    await this.priorityRuleRepository.update({ ruleId, userId }, updates);
    return this.priorityRuleRepository.findOne({ where: { ruleId, userId } });
  }

  async deletePriorityRule(ruleId: string, userId: string): Promise<void> {
    await this.priorityRuleRepository.delete({ ruleId, userId });
  }
}

