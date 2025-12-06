import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../database/entities/email.entity';
import { UserContext, ContextKey } from '../database/entities/user-context.entity';
import { LLMService } from '../llm/llm.service';
import * as natural from 'natural';

/**
 * Priority explanation structure
 */
export interface PriorityExplanation {
  score: number;
  factors: Array<{
    type: string;
    description: string;
    contribution: number;
  }>;
}

@Injectable()
export class PriorityService {
  private readonly logger = new Logger(PriorityService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private llmService: LLMService,
  ) {}

  /**
   * Calculate priority score with explanations
   */
  calculatePriorityWithExplanation(
    email: Partial<Email>,
    contexts: UserContext[],
    daysSinceLastEmail?: number
  ): PriorityExplanation {
    let baseScore = 50;
    const factors: Array<{ type: string; description: string; contribution: number }> = [];
    
    // VIP Contact boost (+25)
    const vipContacts = contexts.filter(c => c.contextKey === ContextKey.VIP_CONTACT);
    const matchingVip = vipContacts.find(vip => 
      email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) || 
      email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase())
    );
    if (matchingVip) {
      baseScore += 25;
      factors.push({
        type: 'VIP_CONTACT',
        description: `From VIP contact: ${matchingVip.contextValue}`,
        contribution: 25,
      });
    }

    // Goal alignment boost (+20 max)
    const goals = contexts.filter(c => c.contextKey === ContextKey.MY_GOALS);
    const emailText = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
    const matchingGoals: string[] = [];
    for (const goal of goals) {
      const keywords = goal.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      if (keywords.some(keyword => emailText.includes(keyword))) {
        matchingGoals.push(goal.contextValue);
      }
    }
    if (matchingGoals.length > 0) {
      const goalBoost = Math.min(20, Math.round((matchingGoals.length / goals.length) * 20));
      baseScore += goalBoost;
      factors.push({
        type: 'GOAL_ALIGNMENT',
        description: `Aligned with goals: ${matchingGoals.join(', ')}`,
        contribution: goalBoost,
      });
    }

    // Working on / Current projects boost (+15 max, weighted by priority)
    const workingOn = contexts.filter(c => c.contextKey === ContextKey.WORKING_ON);
    for (const project of workingOn) {
      const keywords = project.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      if (keywords.some(keyword => emailText.includes(keyword))) {
        // Priority 1 = +15, Priority 2 = +10, Priority 3 = +5
        const priorityBoost = project.priority === 1 ? 15 : project.priority === 2 ? 10 : 5;
        baseScore += priorityBoost;
        factors.push({
          type: 'CURRENT_PROJECT',
          description: `Related to current work: ${project.contextValue}`,
          contribution: priorityBoost,
        });
        break; // Only count one project match
      }
    }

    // Don't care penalty (-20)
    const dontCare = contexts.filter(c => c.contextKey === ContextKey.DONT_CARE);
    for (const item of dontCare) {
      const keywords = item.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      if (keywords.some(keyword => emailText.includes(keyword))) {
        baseScore -= 20;
        factors.push({
          type: 'NOT_IMPORTANT',
          description: `Not important: ${item.contextValue}`,
          contribution: -20,
        });
        break;
      }
    }

    // Sentiment analysis (urgency indicators)
    const sentimentScore = this.analyzeSentiment(email.body || '');
    const sentimentBoost = sentimentScore * 15;
    if (Math.abs(sentimentBoost) > 1) {
      baseScore += sentimentBoost;
      factors.push({
        type: 'SENTIMENT',
        description: sentimentScore > 0 ? 'Contains urgency indicators' : 'Contains low-priority indicators',
        contribution: Math.round(sentimentBoost),
      });
    }

    // Job title score
    const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle || '');
    if (jobTitleScore > 0) {
      const jobBoost = jobTitleScore * 10;
      baseScore += jobBoost;
      factors.push({
        type: 'SENDER_ROLE',
        description: `From ${email.senderJobTitle || 'important role'}`,
        contribution: Math.round(jobBoost),
      });
    }

    // Days since last email - exponential increase in priority
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 0) {
      const daysBoost = Math.min(30, 2 * Math.pow(daysSinceLastEmail, 1.5));
      baseScore += daysBoost;
      if (daysBoost > 5) {
        factors.push({
          type: 'RECENCY',
          description: `${Math.round(daysSinceLastEmail)} days since last email`,
          contribution: Math.round(daysBoost),
        });
      }
    }

    // Urgent keywords boost
    if (this.checkIfUrgent(email)) {
      baseScore += 20;
      factors.push({
        type: 'URGENT_KEYWORDS',
        description: 'Contains urgent keywords',
        contribution: 20,
      });
    }

    // Ensure score is between 0-100
    const finalScore = Math.max(0, Math.min(100, baseScore));

    return {
      score: finalScore,
      factors: factors.filter(f => Math.abs(f.contribution) >= 5), // Only show significant factors
    };
  }

  /**
   * Calculate priority score using user context (backwards compatible)
   */
  calculateBasicPriorityScore(
    email: Partial<Email>, 
    contexts: UserContext[], 
    daysSinceLastEmail?: number
  ): number {
    return this.calculatePriorityWithExplanation(email, contexts, daysSinceLastEmail).score;
  }

  checkIfUrgent(email: Partial<Email>): boolean {
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
  ): Promise<number> {
    // Get user context for prioritization
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });

    return this.calculateBasicPriorityScore(email, contexts);
  }

  async getUserContexts(userId: string): Promise<UserContext[]> {
    return this.userContextRepository.find({
      where: { userId },
    });
  }

  analyzeSentiment(text: string): number {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    
    const positiveWords = ['urgent', 'important', 'asap', 'critical', 'deadline', 'meeting', 'action'];
    const negativeWords = ['no rush', 'whenever', 'optional', 'low priority'];
    
    let score = 0;
    tokens.forEach((token) => {
      if (positiveWords.some((w) => token.includes(w))) score += 1;
      if (negativeWords.some((w) => token.includes(w))) score -= 1;
    });
    
    return Math.max(-1, Math.min(1, score / 10));
  }

  calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;
    
    const highPriorityTitles = ['ceo', 'president', 'director', 'manager', 'lead', 'head'];
    const titleLower = jobTitle.toLowerCase();
    
    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return 1;
    }
    
    return 0.5;
  }
}
