import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../database/entities/email.entity';
import { PriorityRule, RuleType } from '../database/entities/priority-rule.entity';
import { LLMService } from '../llm/llm.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PriorityLearningService {
  private readonly logger = new Logger(PriorityLearningService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(PriorityRule)
    private priorityRuleRepository: Repository<PriorityRule>,
    private llmService: LLMService,
    private usersService: UsersService,
  ) {}

  /**
   * Learn from user's star selection and create/update priority rules
   * Called when user sets starCount (0-3) on an email
   */
  async learnFromStarSelection(userId: string, emailId: string, starCount: number): Promise<void> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for user ${userId}`);
        return;
      }

      // Get user's recent emails from this sender to analyze patterns
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
        .where('email.userId = :userId', { userId })
        .andWhere('email.from = :from', { from: email.from })
        .orderBy('email.receivedAt', 'DESC')
        .take(20)
        .getRawAndEntities();
      
      // Add thread properties as virtual properties
      const recentEmailsFromSender = result.entities.map((e, index) => {
        const raw = result.raw[index];
        (e as any).starCount = raw.thread_starCount ?? 0;
        (e as any).isArchived = raw.thread_isArchived ?? false;
        return e;
      });

      // Count how many times user starred emails from this sender
      const starredCount = recentEmailsFromSender.filter(e => (e as any).starCount > 0).length;
      const threeStarCount = recentEmailsFromSender.filter(e => (e as any).starCount === 3).length;
      const archivedCount = recentEmailsFromSender.filter(e => (e as any).isArchived).length;

      // Only learn if there's a pattern (user has starred this sender multiple times)
      // OR if user explicitly set 3 stars (high importance)
      if (starCount === 3 || starredCount >= 3) {
        await this.createNaturalLanguageRule(userId, email, starCount, recentEmailsFromSender);
      } else if (starCount === 0 && archivedCount >= 3) {
        // Learn that user doesn't prioritize this sender
        await this.createNaturalLanguageRule(userId, email, 0, recentEmailsFromSender);
      }
    } catch (error) {
      this.logger.error(`Error learning from star selection for email ${emailId}`, error);
    }
  }

  /**
   * Use LLM to create a natural language rule based on email patterns
   */
  private async createNaturalLanguageRule(
    userId: string,
    email: Email,
    starCount: number,
    recentEmails: Email[],
  ): Promise<void> {
    try {
      // Extract patterns from recent emails
      const subjects = recentEmails
        .filter(e => (e as any).starCount === starCount)
        .map(e => e.subject)
        .slice(0, 10);
      
      const sender = email.from;
      const senderName = email.fromName || sender;

      // Use LLM to analyze pattern and create natural language rule
      const prompt = `Analyze the following email patterns and create a natural language priority rule.

Sender: ${senderName} (${sender})
Star rating given: ${starCount === 3 ? 'high importance (3 stars)' : starCount === 0 ? 'low importance (archived)' : `${starCount} stars`}

Recent email subjects from this sender that received the same rating:
${subjects.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Based on these patterns, create a clear, natural language rule that describes when emails should receive this priority level.

The rule should be:
1. Specific enough to be actionable
2. Flexible enough to catch similar emails
3. Focus on sender OR subject patterns (or both if there's a clear pattern)

Respond with ONLY a JSON object in this format:
{
  "ruleDescription": "natural language description of when this rule applies",
  "priorityBoost": ${starCount === 3 ? '15' : starCount === 0 ? '-15' : starCount === 2 ? '10' : '5'},
  "conditionType": "sender" | "subject" | "sender_and_subject",
  "conditionPattern": "specific pattern (e.g., sender email or subject keywords)"
}`;

      const llmResponse = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: 'You are an AI assistant that creates email priority rules in natural language. Be concise and specific.',
          temperature: 0.3,
          maxTokens: 500,
          userId,
        },
        undefined,
        userId,
      );

      // Parse LLM response
      let ruleData;
      try {
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          ruleData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        this.logger.error('Failed to parse LLM response', llmResponse);
        // Fallback to simple rule
        ruleData = {
          ruleDescription: starCount === 3 
            ? `High priority: Emails from ${senderName}`
            : starCount === 0
            ? `Low priority: Emails from ${senderName}`
            : `Medium priority: Emails from ${senderName}`,
          priorityBoost: starCount === 3 ? 15 : starCount === 0 ? -15 : starCount === 2 ? 10 : 5,
          conditionType: 'sender',
          conditionPattern: sender,
        };
      }

      // Check if rule already exists for this sender
      const existingRules = await this.priorityRuleRepository.find({
        where: { userId, ruleType: RuleType.IMPLICIT_BEHAVIOR },
      });

      // Decrypt rules to check for matching patterns
      const matchingRule = existingRules.find(rule => {
        const conditionKey = rule.conditionKey;
        const conditionVal = rule.conditionVal;
        // Check if this rule matches the sender or has similar pattern
        return (conditionKey === 'from' && conditionVal === sender) ||
               (conditionKey === 'naturalLanguage' && conditionVal?.includes(senderName));
      });

      if (matchingRule) {
        // Update existing rule - refine it based on new pattern
        await this.refineRule(matchingRule, ruleData, userId);
      } else {
        // Create new rule
        await this.priorityRuleRepository.save({
          userId,
          ruleType: RuleType.IMPLICIT_BEHAVIOR,
          conditionKey: ruleData.conditionType === 'sender' ? 'from' : 
                       ruleData.conditionType === 'subject' ? 'subject' : 'naturalLanguage',
          conditionVal: ruleData.conditionPattern || ruleData.ruleDescription,
          priorityBoost: parseInt(ruleData.priorityBoost) || (starCount === 3 ? 15 : starCount === 0 ? -15 : 5),
          // Store natural language description in conditionVal for sender_and_subject type
          ...(ruleData.conditionType === 'sender_and_subject' && {
            conditionKey: 'naturalLanguage',
            conditionVal: ruleData.ruleDescription,
          }),
        });

        this.logger.log(`Created priority rule for user ${userId}: ${ruleData.ruleDescription}`);
      }
    } catch (error) {
      this.logger.error('Error creating natural language rule', error);
    }
  }

  /**
   * Refine an existing rule based on new pattern
   */
  private async refineRule(existingRule: PriorityRule, newRuleData: any, userId: string): Promise<void> {
    // Use LLM to merge/refine the rule
    const prompt = `Refine this existing priority rule based on new patterns:

Existing rule: ${existingRule.conditionVal}
New pattern data: ${JSON.stringify(newRuleData)}

Create an improved, refined rule that combines both patterns. Return only a JSON object with the same format as before.`;

    try {
      const llmResponse = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: 'You are an AI assistant that refines email priority rules. Merge patterns intelligently.',
          temperature: 0.3,
          maxTokens: 500,
          userId,
        },
        undefined,
        userId,
      );

      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const refinedData = JSON.parse(jsonMatch[0]);
        existingRule.conditionVal = refinedData.ruleDescription || refinedData.conditionPattern || existingRule.conditionVal;
        existingRule.priorityBoost = parseInt(refinedData.priorityBoost) || existingRule.priorityBoost;
        await this.priorityRuleRepository.save(existingRule);
        this.logger.log(`Refined priority rule ${existingRule.ruleId} for user ${userId}`);
      }
    } catch (error) {
      this.logger.error('Error refining rule', error);
    }
  }

  /**
   * Evaluate a natural language rule against an email
   * This is used during priority calculation
   */
  async evaluateNaturalLanguageRule(
    userId: string,
    rule: PriorityRule,
    email: Partial<Email>,
  ): Promise<boolean> {
    // For now, simple pattern matching
    // In the future, could use LLM for more complex evaluation
    const conditionVal = rule.conditionVal.toLowerCase();
    const emailFrom = (email.from || '').toLowerCase();
    const emailSubject = (email.subject || '').toLowerCase();
    const emailFromName = (email.fromName || '').toLowerCase();

    if (rule.conditionKey === 'from' || rule.conditionKey === 'naturalLanguage') {
      return emailFrom.includes(conditionVal) || 
             emailFromName.includes(conditionVal) ||
             emailSubject.includes(conditionVal);
    }

    return false;
  }
}
