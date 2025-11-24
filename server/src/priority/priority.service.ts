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

  async calculatePriorityScore(
    userId: number,
    email: Partial<Email>,
    useLLM: boolean = true,
    provider?: 'gemini' | 'openai',
  ): Promise<number> {
    // Get all priority rules for the user
    const rules = await this.priorityRuleRepository.find({
      where: { userId },
    });

    // Apply explicit rules first (always use these)
    let baseScore = 50;
    const explicitRules = rules.filter((r) => r.ruleType === RuleType.EXPLICIT_SENDER);
    for (const rule of explicitRules) {
      if (this.matchesCondition(email, rule.conditionKey, rule.conditionVal)) {
        baseScore += rule.priorityBoost;
      }
    }

    // Try LLM-based prioritization if enabled
    if (useLLM) {
      try {
        // Get user's email history for context
        const userEmails = await this.emailRepository.find({
          where: { userId },
          take: 50,
          order: { receivedAt: 'DESC' },
        });

        const avgTimeToReply = userEmails.length > 0
          ? userEmails
              .filter((e) => e.timeToReply)
              .reduce((sum, e) => sum + (e.timeToReply || 0), 0) / userEmails.filter((e) => e.timeToReply).length
          : undefined;

        const llmResult = await this.llmService.analyzePriority(
          {
            from: email.from || '',
            fromName: email.fromName,
            senderJobTitle: email.senderJobTitle,
            subject: email.subject || '',
            body: email.body || '',
          },
          {
            averageTimeToReply: avgTimeToReply,
          },
          provider as any,
        );

        // Combine LLM score with rule-based adjustments
        const llmScore = llmResult.score;
        const combinedScore = (baseScore * 0.3) + (llmScore * 0.7);

        this.logger.debug(`Priority: LLM=${llmScore}, Rules=${baseScore}, Combined=${combinedScore}, Urgent=${llmResult.isUrgent}`);

        // Update email urgency flag if LLM detected it
        if (llmResult.isUrgent && email.id) {
          await this.emailRepository.update({ id: email.id }, { isUrgent: true });
        }

        return Math.max(0, Math.min(100, combinedScore));
      } catch (error) {
        this.logger.warn('LLM prioritization failed, falling back to rule-based', error);
        // Fall through to rule-based calculation
      }
    }

    // Fallback to rule-based calculation
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
      const normalizedTime = Math.max(0, Math.min(1, 1 - email.timeToReply / 168)); // Normalize to 0-1 (168 hours = 1 week)
      baseScore += timeWeight * normalizedTime * 15;
    }

    // Ensure score is between 0-100
    return Math.max(0, Math.min(100, baseScore));
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

  async getPriorityRules(userId: number): Promise<PriorityRule[]> {
    return this.priorityRuleRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async createPriorityRule(userId: number, rule: Partial<PriorityRule>): Promise<PriorityRule> {
    const newRule = this.priorityRuleRepository.create({
      ...rule,
      userId,
    });
    return this.priorityRuleRepository.save(newRule);
  }

  async updatePriorityRule(ruleId: number, userId: number, updates: Partial<PriorityRule>): Promise<PriorityRule> {
    await this.priorityRuleRepository.update({ ruleId, userId }, updates);
    return this.priorityRuleRepository.findOne({ where: { ruleId, userId } });
  }

  async deletePriorityRule(ruleId: number, userId: number): Promise<void> {
    await this.priorityRuleRepository.delete({ ruleId, userId });
  }
}

