import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../database/entities/email.entity';
import { PriorityRule } from '../database/entities/priority-rule.entity';
import { LLMService } from '../llm/llm.service';
import { PriorityService } from './priority.service';
import { EmailsService } from '../emails/emails.service';

export interface TriageSuggestion {
  emailId: string;
  suggestedStarCount: number; // 0-3
  suggestedArchive: boolean;
  confidence: number; // 0-100
  reasoning: string;
}

@Injectable()
export class TriageSuggestionsService {
  private readonly logger = new Logger(TriageSuggestionsService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(PriorityRule)
    private priorityRuleRepository: Repository<PriorityRule>,
    private llmService: LLMService,
    private priorityService: PriorityService,
    private emailsService: EmailsService,
  ) {}

  /**
   * Generate triage suggestions for a list of emails
   */
  async generateSuggestions(userId: string, emailIds: string[]): Promise<TriageSuggestion[]> {
    // Join with email_threads to get thread-level properties
    const result = await this.emailRepository
      .createQueryBuilder('email')
      .innerJoin('email_threads', 'thread', 'thread.id = email.emailThreadId')
      .select([
        'email.id',
        'email.userId',
        'email.threadId',
        'email.from',
        'email.fromName',
        'email.subject',
        'email.receivedAt',
      ])
      .addSelect('thread.starCount', 'thread_starCount')
      .addSelect('thread.isArchived', 'thread_isArchived')
      .where('email.id IN (:...ids)', { ids: emailIds })
      .andWhere('email.userId = :userId', { userId })
      .getRawAndEntities();
    
    // Add thread properties as virtual properties
    const emails = result.entities.map((email, index) => {
      const raw = result.raw[index];
      (email as any).starCount = raw.thread_starCount ?? 0;
      (email as any).isArchived = raw.thread_isArchived ?? false;
      return email;
    });

    if (emails.length === 0) {
      return [];
    }

    // Get user's priority rules for context
    const rules = await this.priorityService.getPriorityRules(userId);
    
    // Get user's email history for pattern analysis
    // Join with email_threads to get thread-level properties
    const historyResult = await this.emailRepository
      .createQueryBuilder('email')
      .innerJoin('email_threads', 'thread', 'thread.id = email.emailThreadId')
      .select([
        'email.id',
        'email.userId',
        'email.threadId',
        'email.from',
        'email.fromName',
        'email.subject',
        'email.receivedAt',
      ])
      .addSelect('thread.starCount', 'thread_starCount')
      .addSelect('thread.isArchived', 'thread_isArchived')
      .where('email.userId = :userId', { userId })
      .orderBy('email.receivedAt', 'DESC')
      .take(50)
      .getRawAndEntities();
    
    // Add thread properties as virtual properties
    const recentEmails = historyResult.entities.map((email, index) => {
      const raw = historyResult.raw[index];
      (email as any).starCount = raw.thread_starCount ?? 0;
      (email as any).isArchived = raw.thread_isArchived ?? false;
      return email;
    });

    // Analyze patterns from recent behavior
    const senderPatterns = this.analyzeSenderPatterns(recentEmails);
    const subjectPatterns = this.analyzeSubjectPatterns(recentEmails);

    const suggestions: TriageSuggestion[] = [];

    // Process emails in batches to avoid overwhelming LLM
    const batchSize = 5;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchSuggestions = await Promise.all(
        batch.map(email => this.suggestForEmail(userId, email, rules, senderPatterns, subjectPatterns))
      );
      suggestions.push(...batchSuggestions);
    }

    return suggestions;
  }

  /**
   * Generate suggestion for a single email
   */
  private async suggestForEmail(
    userId: string,
    email: Email,
    rules: PriorityRule[],
    senderPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
    subjectPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
  ): Promise<TriageSuggestion> {
    try {
      // Calculate suggested star count based on priority score
      // Priority scores: 0-100, map to stars: 0-40 = 0 stars, 40-60 = 1 star, 60-80 = 2 stars, 80+ = 3 stars
      const priorityScore = email.priorityScore ?? 50;
      const suggestedStarCountFromPriority = 
        priorityScore >= 80 ? 3 :
        priorityScore >= 60 ? 2 :
        priorityScore >= 40 ? 1 : 0;

      // First check rules for quick decision
      const ruleMatch = this.matchRules(email, rules);
      if (ruleMatch) {
        // Combine rule-based suggestion with priority score
        const ruleBasedStars = ruleMatch.priorityBoost >= 15 ? 3 : 
                               ruleMatch.priorityBoost >= 10 ? 2 :
                               ruleMatch.priorityBoost >= 5 ? 1 : 0;
        // Take the higher of rule-based or priority-based stars
        const suggestedStarCount = Math.max(ruleBasedStars, suggestedStarCountFromPriority);
        const suggestedArchive = ruleMatch.priorityBoost < -10;

        return {
          emailId: email.id,
          suggestedStarCount,
          suggestedArchive,
          confidence: 85,
          reasoning: `Based on priority rule: ${ruleMatch.description} (priority score: ${priorityScore.toFixed(1)})`,
        };
      }

      // Check historical patterns
      const senderPattern = senderPatterns.get(email.from.toLowerCase());
      const subjectKeywords = this.extractKeywords(email.subject);
      const relevantSubjectPattern = Array.from(subjectPatterns.keys()).find(keyword =>
        email.subject.toLowerCase().includes(keyword.toLowerCase())
      );
      const subjectPattern = relevantSubjectPattern ? subjectPatterns.get(relevantSubjectPattern) : null;

      // If we have strong patterns, use those
      if (senderPattern && senderPattern.avgStarCount >= 2.5) {
        return {
          emailId: email.id,
          suggestedStarCount: Math.round(senderPattern.avgStarCount),
          suggestedArchive: senderPattern.archiveRate > 0.7,
          confidence: 75,
          reasoning: `You typically star emails from this sender`,
        };
      }

      if (senderPattern && senderPattern.archiveRate > 0.7) {
        return {
          emailId: email.id,
          suggestedStarCount: 0,
          suggestedArchive: true,
          confidence: 70,
          reasoning: `You typically archive emails from this sender`,
        };
      }

      // Use LLM for more nuanced suggestions, but include priority score as guidance
      const llmSuggestion = await this.llmSuggest(userId, email, senderPattern, subjectPattern, priorityScore);
      
      // Ensure LLM suggestion aligns with priority score (take the higher)
      if (llmSuggestion.suggestedStarCount < suggestedStarCountFromPriority) {
        llmSuggestion.suggestedStarCount = suggestedStarCountFromPriority;
        llmSuggestion.reasoning = `${llmSuggestion.reasoning} (adjusted based on priority score: ${priorityScore.toFixed(1)})`;
      }
      
      return llmSuggestion;
    } catch (error) {
      this.logger.error(`Error generating suggestion for email ${email.id}`, error);
      // Fallback to neutral suggestion
      return {
        emailId: email.id,
        suggestedStarCount: 0,
        suggestedArchive: false,
        confidence: 0,
        reasoning: 'Unable to generate suggestion',
      };
    }
  }

  /**
   * Use LLM to generate suggestion
   */
  private async llmSuggest(
    userId: string,
    email: Email,
    senderPattern: { avgStarCount: number; archiveRate: number } | undefined,
    subjectPattern: { avgStarCount: number; archiveRate: number } | undefined,
    priorityScore: number,
  ): Promise<TriageSuggestion> {
    const patternContext = senderPattern
      ? `\nHistorical pattern: You typically give ${senderPattern.avgStarCount.toFixed(1)} stars to emails from this sender, and archive ${(senderPattern.archiveRate * 100).toFixed(0)}% of them.`
      : '';

    // Map priority score to suggested star count: 0-40=0, 40-60=1, 60-80=2, 80+=3
    const priorityBasedStars = priorityScore >= 80 ? 3 : priorityScore >= 60 ? 2 : priorityScore >= 40 ? 1 : 0;
    
    const prompt = `Analyze this email and suggest a triage action based on priority and importance.

Email from: ${email.fromName || email.from}
Subject: ${email.subject || '(no subject)'}
Body preview: ${(email.body || '').substring(0, 500)}${patternContext}

IMPORTANT: This email has a priority score of ${priorityScore.toFixed(1)} (on a scale of 0-100).
Based on the priority score, it should have approximately ${priorityBasedStars} star(s):
- Priority 80+ = 3 stars (very important)
- Priority 60-80 = 2 stars (important)
- Priority 40-60 = 1 star (somewhat important)
- Priority <40 = 0 stars (not important)

Based on the email content AND the priority score, suggest:
1. Star count (0-3): Should align with the priority score unless content indicates otherwise
2. Whether to archive immediately (true/false)

Respond with ONLY a JSON object:
{
  "suggestedStarCount": 0-3,
  "suggestedArchive": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation mentioning priority score"
}`;

    try {
      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: 'You are an email triage assistant. Suggest appropriate priority and archive actions based on email importance.',
          temperature: 0.3,
          maxTokens: 300,
          userId,
        },
        undefined,
        userId,
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          emailId: email.id,
          suggestedStarCount: Math.max(0, Math.min(3, parsed.suggestedStarCount || 0)),
          suggestedArchive: parsed.suggestedArchive || false,
          confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
          reasoning: parsed.reasoning || 'AI-generated suggestion',
        };
      }
    } catch (error) {
      this.logger.error('Error parsing LLM response for triage suggestion', error);
    }

    // Fallback
    return {
      emailId: email.id,
      suggestedStarCount: 0,
      suggestedArchive: false,
      confidence: 50,
      reasoning: 'Unable to analyze email',
    };
  }

  /**
   * Analyze sender patterns from recent emails
   */
  private analyzeSenderPatterns(emails: Email[]): Map<string, { avgStarCount: number; archiveRate: number }> {
    const patterns = new Map<string, { starCounts: number[]; archived: number; total: number }>();

    for (const email of emails) {
      const sender = email.from.toLowerCase();
      if (!patterns.has(sender)) {
        patterns.set(sender, { starCounts: [], archived: 0, total: 0 });
      }

      const pattern = patterns.get(sender)!;
      pattern.total++;
      const starCount = (email as any).starCount ?? 0;
      if (starCount > 0) {
        pattern.starCounts.push(starCount);
      }
      if ((email as any).isArchived) {
        pattern.archived++;
      }
    }

    const result = new Map<string, { avgStarCount: number; archiveRate: number }>();
    for (const [sender, pattern] of patterns.entries()) {
      if (pattern.total >= 2) { // Only include patterns with at least 2 emails
        result.set(sender, {
          avgStarCount: pattern.starCounts.length > 0
            ? pattern.starCounts.reduce((sum, val) => sum + val, 0) / pattern.starCounts.length
            : 0,
          archiveRate: pattern.archived / pattern.total,
        });
      }
    }

    return result;
  }

  /**
   * Analyze subject patterns from recent emails
   */
  private analyzeSubjectPatterns(emails: Email[]): Map<string, { avgStarCount: number; archiveRate: number }> {
    // Extract keywords from subjects and analyze patterns
    // This is a simplified version - could be enhanced with NLP
    const keywordPatterns = new Map<string, { starCounts: number[]; archived: number; total: number }>();

    for (const email of emails) {
      const keywords = this.extractKeywords(email.subject);
      for (const keyword of keywords) {
        if (!keywordPatterns.has(keyword)) {
          keywordPatterns.set(keyword, { starCounts: [], archived: 0, total: 0 });
        }

        const pattern = keywordPatterns.get(keyword)!;
        pattern.total++;
        const starCount = (email as any).starCount ?? 0;
        if (starCount > 0) {
          pattern.starCounts.push(starCount);
        }
        if ((email as any).isArchived) {
          pattern.archived++;
        }
      }
    }

    const result = new Map<string, { avgStarCount: number; archiveRate: number }>();
    for (const [keyword, pattern] of keywordPatterns.entries()) {
      if (pattern.total >= 3) { // Only include keywords that appear in at least 3 emails
        result.set(keyword, {
          avgStarCount: pattern.starCounts.length > 0
            ? pattern.starCounts.reduce((sum, val) => sum + val, 0) / pattern.starCounts.length
            : 0,
          archiveRate: pattern.archived / pattern.total,
        });
      }
    }

    return result;
  }

  /**
   * Extract keywords from subject line
   */
  private extractKeywords(subject: string): string[] {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 're:', 'fw:', 'fwd:']);
    const words = subject.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 5); // Take top 5 keywords
    return words;
  }

  /**
   * Match email against priority rules
   */
  private matchRules(email: Email, rules: PriorityRule[]): { priorityBoost: number; description: string } | null {
    for (const rule of rules) {
      const conditionKey = rule.conditionKey.toLowerCase();
      const conditionVal = rule.conditionVal.toLowerCase();

      if (conditionKey === 'from' && email.from.toLowerCase().includes(conditionVal)) {
        return { priorityBoost: rule.priorityBoost, description: rule.conditionVal };
      }
      if (conditionKey === 'subject' && email.subject?.toLowerCase().includes(conditionVal)) {
        return { priorityBoost: rule.priorityBoost, description: rule.conditionVal };
      }
      if (conditionKey === 'naturallanguage' && 
          (email.subject?.toLowerCase().includes(conditionVal) || 
           email.from.toLowerCase().includes(conditionVal))) {
        return { priorityBoost: rule.priorityBoost, description: rule.conditionVal };
      }
    }
    return null;
  }

  /**
   * Track when user overrides a suggestion (for learning)
   */
  async trackOverride(userId: string, emailId: string, suggestion: TriageSuggestion, userAction: { starCount: number; archived: boolean }): Promise<void> {
    // Queue a job to learn from the override
    // This will help improve future suggestions
    this.logger.log(`User overrode suggestion for email ${emailId}: suggested ${suggestion.suggestedStarCount} stars/${suggestion.suggestedArchive} archive, user chose ${userAction.starCount} stars/${userAction.archived} archive`);
    
    // Could queue a learning job here to refine rules
    // For now, just log it - the existing star selection learning will handle it
  }
}
