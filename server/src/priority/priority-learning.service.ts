import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PRIORITY_LEARNING_REASONS } from "../constants/domain-types";
import { STAR_COUNTS } from "../constants/priority-constants";
import { PRIORITY_LEARNING_CONSTANTS } from "../constants/priority-learning-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { LEARNING_THRESHOLDS } from "../constants/service-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { calculateScoreFromBreakdown } from "../utils/priority.utils";

@Injectable()
export class PriorityLearningService {
  private readonly logger = new Logger(PriorityLearningService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private llmService: LLMService,
    private usersService: UsersService,
  ) {}

  /**
   * Check if user's star selection differs significantly from AI prediction
   * Returns whether we should prompt user for explanation
   */
  async checkStarDiscrepancy(
    userId: string,
    emailId: string,
    userStarCount: number,
  ): Promise<{
    shouldPrompt: boolean;
    predictedStarCount?: number;
    email?: Email;
  }> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        return { shouldPrompt: false };
      }

      // Get priority explanation from thread
      let thread = null;
      if (email.emailThreadId) {
        thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId },
        });
      }

      // Get priority score and convert to predicted star count
      // Priority score 0-25 = 0 stars, 26-50 = 1 star, 51-75 = 2 stars, 76-100 = 3 stars
      const priorityScore =
        calculateScoreFromBreakdown(thread?.priorityExplanation) ||
        PRIORITY_LEARNING_CONSTANTS.PRIORITY_SCORE_DEFAULT;
      const predictedStarCount = this.priorityScoreToStarCount(priorityScore);

      // Check for significant discrepancy (difference of 2 or more)
      const discrepancy = Math.abs(userStarCount - predictedStarCount);
      const shouldPrompt =
        // STAR_COUNTS.NONE
        discrepancy >= QUERY_LIMITS.MAX_RESULTS_MULTIPLIER && userStarCount > 0;

      return {
        shouldPrompt,
        predictedStarCount,
        email,
      };
    } catch (error) {
      this.logger.error(
        `Error checking star discrepancy for email ${emailId}`,
        error,
      );
      return { shouldPrompt: false };
    }
  }

  /**
   * Store user feedback about why they gave different priority than AI predicted
   */
  async storeStarFeedback(
    userId: string,
    emailId: string,
    userStarCount: number,
    predictedStarCount: number,
    explanation: string,
  ): Promise<void> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for storing feedback`);
        return;
      }

      // Create or update context based on user feedback
      // Store as USER_EDITED context with explanation
      const contextValue =
        userStarCount > predictedStarCount
          ? `Higher priority than expected: ${email.fromName || email.from}`
          : `Lower priority than expected: ${email.fromName || email.from}`;

      await this.userContextRepository.save({
        userId,
        contextKey:
          userStarCount === 3 ? ContextKey.VIP_CONTACT : ContextKey.OTHER,
        contextValue,
        source: Source.USER_EDITED,
        explanation: `User feedback: ${explanation}`,
      });

      this.logger.log(
        `Stored star feedback for email ${emailId}: ${explanation}`,
      );
    } catch (error) {
      this.logger.error(
        `Error storing star feedback for email ${emailId}`,
        error,
      );
    }
  }

  /**
   * Learn from user's star selection and potentially add VIP contacts
   * Called when user sets starCount (0-3) on an email
   */
  async learnFromStarSelection(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<void> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for user ${userId}`);
        return;
      }

      const recentEmailsFromSender = await this.fetchRecentEmailsFromSender(
        userId,
        email,
      );

      // Count how many times user starred emails from this sender (unused but kept for future use)
      const _starredCount = recentEmailsFromSender.filter(
        (emailEntry) => emailEntry.starCount > 0,
      ).length;
      const threeStarCount = recentEmailsFromSender.filter(
        (emailEntry) => emailEntry.starCount === STAR_COUNTS.HIGH,
      ).length;

      // If user consistently gives 3 stars to this sender, suggest adding as VIP
      if (
        starCount === STAR_COUNTS.HIGH &&
        threeStarCount >= LEARNING_THRESHOLDS.MIN_VIP_OCCURRENCES
      ) {
        await this.suggestVipContact(userId, email);
      }
    } catch (error) {
      this.logger.error(
        `Error learning from star selection for email ${emailId}`,
        error,
      );
    }
  }

  /**
   * Suggest adding a sender as VIP contact
   */
  private async suggestVipContact(userId: string, email: Email): Promise<void> {
    const senderName = email.fromName || email.from;

    // Check if already a VIP
    const existingVip = await this.userContextRepository.findOne({
      where: {
        userId,
        contextKey: ContextKey.VIP_CONTACT,
      },
    });

    // Check if this sender is already in VIP list
    if (existingVip) {
      const existingVips = await this.userContextRepository.find({
        where: { userId, contextKey: ContextKey.VIP_CONTACT },
      });

      const alreadyVip = existingVips.some(
        (vip) =>
          email.from.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
          vip.contextValue.toLowerCase().includes(email.from.toLowerCase()),
      );

      if (alreadyVip) {
        return;
      }
    }

    // Auto-add as VIP (could also prompt user instead)
    await this.userContextRepository.save({
      userId,
      contextKey: ContextKey.VIP_CONTACT,
      contextValue: senderName,
      source: Source.AUTOGENERATED,
    });

    this.logger.log(
      `Auto-added ${senderName} as VIP contact for user ${userId}`,
    );
  }

  /**
   * Process override reason to improve future scoring
   * Analyzes reason text and updates user context rules
   */
  async processOverrideReason(
    userId: string,
    email: Email,
    reasonType: string,
    reasonText: string,
  ): Promise<void> {
    try {
      const contexts = await this.userContextRepository.find({
        where: { userId },
      });

      // Use LLM to analyze the override reason and suggest rule updates
      const analysis = await this.llmService.analyzeOverrideReason({
        email: {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        reasonType,
        reasonText,
        currentContext: contexts.map((item) => ({
          contextKey: item.contextKey,
          contextValue: item.contextValue,
          priority: item.priority,
        })),
        userId,
      });

      await this.applyContextUpdates(
        userId,
        analysis.updatedContexts,
        reasonText,
      );
      await this.handleReasonTypeSpecificLogic(
        userId,
        email,
        reasonType,
        reasonText,
      );

      this.logger.log(
        `Processed override reason for email ${email.id}: ${reasonType} - ${reasonText}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing override reason for email ${email.id}`,
        error,
      );
    }
  }

  /**
   * Learn from user's urgency override
   * Extracts patterns and updates context with urgency thresholds
   */
  async learnFromUrgencyOverride(
    userId: string,
    email: Email,
    urgencyScore: number,
    reason: string,
  ): Promise<void> {
    try {
      const senderName = email.fromName || email.from;

      const patterns = this.buildUrgencyPatterns(email, senderName);
      const contextValue = this.buildUrgencyContextValue(
        urgencyScore,
        senderName,
      );

      await this.upsertUrgencyContext(userId, email, senderName, {
        urgencyScore,
        reason,
        patterns,
        contextValue,
      });

      // If urgency score is very high (>=90), also consider adding as VIP
      if (urgencyScore >= PRIORITY_LEARNING_CONSTANTS.URGENCY_HIGH_THRESHOLD) {
        await this.addVipIfHighUrgency(userId, email, senderName, urgencyScore);
      }
    } catch (error) {
      this.logger.error(
        `Error learning from urgency override for email ${email.id}`,
        error,
      );
    }
  }

  /**
   * Learn from user feedback on prioritization
   * User provides text feedback explaining why prioritization was wrong
   * Returns information about what context was updated
   */
  async learnFromPriorityFeedback(
    userId: string,
    email: Email,
    feedback: string,
    expectedPriority?: number,
  ): Promise<{
    updated: Array<{
      contextKey: string;
      contextValue: string;
      action: "created" | "updated";
    }>;
  }> {
    const updated: Array<{
      contextKey: string;
      contextValue: string;
      action: "created" | "updated";
    }> = [];

    try {
      this.logger.log(
        `Processing priority feedback for email ${email.id}: "${feedback.substring(0, 100)}..."`,
      );

      const contextSummary = await this.fetchContextSummary(userId);

      // Use LLM to analyze feedback and extract patterns
      const analysis = await this.llmService.analyzeOverrideReason({
        email: {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        reasonType: expectedPriority
          ? `Expected priority: ${expectedPriority}`
          : "Priority feedback",
        reasonText: feedback,
        currentContext: contextSummary,
        userId,
      });

      // Update or create context entries based on LLM analysis
      for (const contextUpdate of analysis.updatedContexts) {
        const result = await this.applyOrCreateContextEntry(
          userId,
          contextUpdate,
          feedback,
        );
        if (result) {
          updated.push(result);
        }
      }

      this.logger.log(
        `Successfully processed priority feedback for email ${email.id}. Updated ${updated.length} context entries.`,
      );

      return { updated };
    } catch (error) {
      this.logger.error(
        `Error processing priority feedback for email ${email.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Convert a priority score (0-100) to a star count (0-3)
   */
  private priorityScoreToStarCount(priorityScore: number): number {
    // Maps 0-25 → 0 stars, 26-50 → 1 star, 51-75 → 2 stars, 76-100 → 3 stars
    if (priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_LOW) {
      return STAR_COUNTS.NONE;
    } else if (
      priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_MEDIUM
    ) {
      return STAR_COUNTS.LOW;
    } else if (
      priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_HIGH
    ) {
      return STAR_COUNTS.MEDIUM;
    } else {
      return STAR_COUNTS.HIGH;
    }
  }

  /**
   * Fetch recent emails from the same sender as the given email
   */
  private async fetchRecentEmailsFromSender(
    userId: string,
    email: Email,
  ): Promise<Array<Email & { starCount: number; isArchived: boolean }>> {
    // Define type for email with joined thread properties
    interface EmailWithThreadProps extends Email {
      starCount: number;
      isArchived: boolean;
    }

    const result = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .select([
        "email.id",
        "email.userId",
        "email.threadId",
        "email.from",
        "email.fromName",
        "email.subject",
        "email.receivedAt",
      ])
      .addSelect("thread.starCount", "thread_starCount")
      .addSelect("thread.isArchived", "thread_isArchived")
      .where("email.userId = :userId", { userId })
      .andWhere("email.from = :from", { from: email.from })
      .orderBy("email.receivedAt", "DESC")
      .take(QUERY_LIMITS.PRIORITY_LEARNING_MAX_SAMPLES)
      .getRawAndEntities();

    return result.entities.map((emailEntry, index) => {
      const raw = result.raw[index] as {
        thread_starCount?: number;
        thread_isArchived?: boolean;
      };
      // Extend email with thread properties from the raw join result
      return Object.assign(emailEntry, {
        starCount: raw.thread_starCount ?? 0,
        isArchived: raw.thread_isArchived ?? false,
      }) as EmailWithThreadProps;
    });
  }

  /**
   * Apply a set of context updates returned from LLM analysis
   */
  private async applyContextUpdates(
    userId: string,
    updatedContexts: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number;
    }>,
    reasonText: string,
  ): Promise<void> {
    for (const contextUpdate of updatedContexts) {
      const validContextKey = this.validateContextKey(contextUpdate.contextKey);
      if (!validContextKey) {
        continue;
      }

      // Check if context already exists
      const existing = await this.userContextRepository.findOne({
        where: {
          userId,
          contextKey: validContextKey,
          contextValue: contextUpdate.contextValue,
        },
      });

      if (!existing) {
        await this.userContextRepository.save({
          userId,
          contextKey: validContextKey,
          contextValue: contextUpdate.contextValue,
          source: Source.USER_EDITED,
          explanation: `Learned from override: ${reasonText}`,
          priority: contextUpdate.priority,
        });
        this.logger.log(
          `Created new context rule from override: ${validContextKey} = ${contextUpdate.contextValue}`,
        );
      }
    }
  }

  /**
   * Handle logic specific to each override reason type
   */
  private async handleReasonTypeSpecificLogic(
    userId: string,
    email: Email,
    reasonType: string,
    reasonText: string,
  ): Promise<void> {
    if (reasonType === PRIORITY_LEARNING_REASONS.WRONG_SENDER_PRIORITY) {
      await this.handleWrongSenderPriorityReason(userId, email, reasonText);
    } else if (reasonType === PRIORITY_LEARNING_REASONS.TOPIC_MISMATCH) {
      await this.handleTopicMismatchReason(userId, reasonText);
    }
  }

  /**
   * Handle the "wrong_sender_priority" reason type by adjusting VIP status if needed
   */
  private async handleWrongSenderPriorityReason(
    userId: string,
    email: Email,
    reasonText: string,
  ): Promise<void> {
    const senderName = email.fromName || email.from;

    // Check if sender is already VIP
    const allVips = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.VIP_CONTACT },
    });
    const isVip = allVips.some(
      (vip) =>
        email.from.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        vip.contextValue.toLowerCase().includes(email.from.toLowerCase()),
    );

    // If reason suggests sender should be higher priority, add as VIP
    const reasonSuggestsHigherPriority =
      reasonText.toLowerCase().includes("higher") ||
      reasonText.toLowerCase().includes("important");

    if (reasonSuggestsHigherPriority && !isVip) {
      await this.userContextRepository.save({
        userId,
        contextKey: ContextKey.VIP_CONTACT,
        contextValue: senderName,
        source: Source.USER_EDITED,
        explanation: `User override: ${reasonText}`,
      });
      this.logger.log(`Added ${senderName} as VIP based on override feedback`);
    }
  }

  /**
   * Handle the "topic_mismatch" reason type by extracting and saving topic to goals
   */
  private async handleTopicMismatchReason(
    userId: string,
    reasonText: string,
  ): Promise<void> {
    // Bounded quantifiers ([\s:]{1,10}, .{1,500}?) keep this linear so a long
    // reason string can't trigger super-linear backtracking (CWE-1333 ReDoS).
    const topicMatch = reasonText.match(
      /(?:topic|about|regarding|concerning)[\s:]{1,10}(.{1,500}?)(?:\.|$)/i,
    );
    if (topicMatch) {
      const topic = topicMatch[1].trim();
      await this.userContextRepository.save({
        userId,
        contextKey: ContextKey.MY_GOALS,
        contextValue: topic,
        source: Source.USER_EDITED,
        explanation: `Learned from override: ${reasonText}`,
      });
      this.logger.log(`Added topic to goals from override: ${topic}`);
    }
  }

  /**
   * Build urgency patterns from email fields (sender + subject keywords)
   */
  private buildUrgencyPatterns(email: Email, senderName: string): string[] {
    const patterns: string[] = [];

    // Add sender pattern
    if (senderName) {
      patterns.push(`from:${senderName.toLowerCase()}`);
    }

    // Extract keywords from subject
    const subjectWords = (email.subject || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);
    patterns.push(
      ...subjectWords.slice(0, QUERY_LIMITS.SUBJECT_WORDS_TOP_COUNT),
    );

    return patterns;
  }

  /**
   * Build a human-readable urgency context value string
   */
  private buildUrgencyContextValue(
    urgencyScore: number,
    senderName: string,
  ): string {
    return urgencyScore >= PRIORITY_LEARNING_CONSTANTS.URGENCY_HIGH_THRESHOLD
      ? `High urgency (${urgencyScore}): ${senderName}`
      : `Urgency ${urgencyScore}: ${senderName}`;
  }

  /**
   * Create or update an URGENT context entry for the given sender
   */
  private async upsertUrgencyContext(
    userId: string,
    email: Email,
    senderName: string,
    opts: {
      urgencyScore: number;
      reason: string;
      patterns: string[];
      contextValue: string;
    },
  ): Promise<void> {
    const { urgencyScore, reason, patterns, contextValue } = opts;

    // Check if similar context already exists
    const existingContexts = await this.userContextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.URGENT,
      },
    });

    const similarContext = existingContexts.find(
      (item) =>
        item.contextValue.toLowerCase().includes(senderName.toLowerCase()) ||
        senderName.toLowerCase().includes(item.contextValue.toLowerCase()),
    );

    if (similarContext) {
      // Update existing context
      similarContext.contextValue = contextValue;
      similarContext.explanation = `User override: ${reason}. Patterns: ${patterns.join(", ")}`;
      similarContext.source = Source.USER_EDITED;
      await this.userContextRepository.save(similarContext);
      this.logger.log(
        `Updated urgency context for ${senderName} with score ${urgencyScore}`,
      );
    } else {
      // Create new context
      await this.userContextRepository.save({
        userId,
        contextKey: ContextKey.URGENT,
        contextValue,
        source: Source.USER_EDITED,
        explanation: `User override: ${reason}. Patterns: ${patterns.join(", ")}. Urgency threshold: ${urgencyScore}`,
      });
      this.logger.log(
        `Created urgency context for ${senderName} with score ${urgencyScore}`,
      );
    }
  }

  /**
   * Add sender as VIP contact if urgency is high and they are not already VIP
   */
  private async addVipIfHighUrgency(
    userId: string,
    email: Email,
    senderName: string,
    urgencyScore: number,
  ): Promise<void> {
    const allVips = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.VIP_CONTACT },
    });
    const isVip = allVips.some(
      (vip) =>
        email.from.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        vip.contextValue.toLowerCase().includes(email.from.toLowerCase()),
    );

    if (!isVip) {
      await this.userContextRepository.save({
        userId,
        contextKey: ContextKey.VIP_CONTACT,
        contextValue: senderName,
        source: Source.USER_EDITED,
        explanation: `Auto-added based on high urgency override (${urgencyScore})`,
      });
      this.logger.log(
        `Auto-added ${senderName} as VIP based on high urgency override`,
      );
    }
  }

  /**
   * Fetch a concise summary of the user's current context entries
   */
  private async fetchContextSummary(userId: string): Promise<
    Array<{
      contextKey: string;
      contextValue: string;
      priority: number | undefined;
    }>
  > {
    const currentContexts = await this.userContextRepository.find({
      where: { userId },
    });
    return currentContexts.slice(0, 10).map((item) => ({
      contextKey: item.contextKey,
      contextValue: item.contextValue,
      priority: item.priority,
    }));
  }

  /**
   * Apply or create a single context entry from LLM analysis output
   * Returns the action taken (created/updated) or null if the key was invalid
   */
  private async applyOrCreateContextEntry(
    userId: string,
    contextUpdate: {
      contextKey: string;
      contextValue: string;
      priority?: number;
    },
    feedback: string,
  ): Promise<{
    contextKey: string;
    contextValue: string;
    action: "created" | "updated";
  } | null> {
    const validContextKey = this.validateContextKey(contextUpdate.contextKey);
    if (!validContextKey) {
      return null;
    }

    // Find existing context or create new one
    const existing = await this.userContextRepository.findOne({
      where: {
        userId,
        contextKey: validContextKey,
        contextValue: contextUpdate.contextValue,
      },
    });

    if (existing) {
      existing.priority = contextUpdate.priority || existing.priority;
      existing.explanation = `Learned from feedback: ${feedback.substring(0, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`;
      existing.source = Source.USER_EDITED;
      await this.userContextRepository.save(existing);
      this.logger.log(
        `Updated context: ${validContextKey} = "${contextUpdate.contextValue}"`,
      );
      return {
        contextKey: validContextKey,
        contextValue: contextUpdate.contextValue,
        action: "updated",
      };
    } else {
      const newContext = this.userContextRepository.create({
        userId,
        contextKey: validContextKey,
        contextValue: contextUpdate.contextValue,
        priority: contextUpdate.priority || 2,
        explanation: `Learned from feedback: ${feedback.substring(0, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
        source: Source.USER_EDITED,
      });
      await this.userContextRepository.save(newContext);
      this.logger.log(
        `Created new context: ${validContextKey} = "${contextUpdate.contextValue}"`,
      );
      return {
        contextKey: validContextKey,
        contextValue: contextUpdate.contextValue,
        action: "created",
      };
    }
  }

  /**
   * Validate that a string is a valid ContextKey enum value
   * Returns the valid key or null (and logs a warning) if invalid
   */
  private validateContextKey(key: string): ContextKey | null {
    const validKey = Object.values(ContextKey).includes(key as ContextKey)
      ? (key as ContextKey)
      : null;

    if (!validKey) {
      this.logger.warn(`Invalid contextKey from LLM: ${key}`);
    }

    return validKey;
  }
}
