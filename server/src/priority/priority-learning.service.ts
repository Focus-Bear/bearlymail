import { Injectable, Logger } from "@nestjs/common";
import { PRIORITY_LEARNING_CONSTANTS } from "../constants/priority-learning-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
  Source,
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
    // eslint-disable-next-line max-params
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
      let predictedStarCount: number;
      if (priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_LOW) {
        // STAR_COUNTS.NONE
        predictedStarCount = 0;
      } else if (
        priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_MEDIUM
      ) {
        // STAR_COUNTS.LOW
        predictedStarCount = 1;
      } else if (
        priorityScore <= PRIORITY_LEARNING_CONSTANTS.PRIORITY_THRESHOLD_HIGH
      ) {
        // STAR_COUNTS.MEDIUM
        predictedStarCount = 2;
      } else {
        // STAR_COUNTS.HIGH
        predictedStarCount = 3;
      }

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
      // eslint-disable-next-line max-lines-per-function
      this.logger.error(
        `Error storing star feedback for email ${emailId}`,
        error,
      );
    }
  }

  // eslint-disable-next-line max-statements
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

      // eslint-disable-next-line max-params
      if (!email) {
        this.logger.warn(`Email ${emailId} not found for user ${userId}`);
        return;
      }

      // Get user's recent emails from this sender
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

      const recentEmailsFromSender = result.entities.map((e, index) => {
        const raw = result.raw[index];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).starCount = raw.thread_starCount ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).isArchived = raw.thread_isArchived ?? false;
        return e;
      });

      // Count how many times user starred emails from this sender
      // Count how many times user starred emails from this sender (unused but kept for future use)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _starredCount = recentEmailsFromSender.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => (e as any).starCount > 0,
      ).length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const threeStarCount = recentEmailsFromSender.filter(
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => (e as any).starCount === 3,
      ).length;

      // If user consistently gives 3 stars to this sender, suggest adding as VIP
      if (starCount === 3 && threeStarCount >= 2) {
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
  // eslint-disable-next-line max-lines-per-function
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
      const analysis = await this.llmService.analyzeOverrideReason(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        reasonType,
        reasonText,
        contexts.map((c) => ({
          contextKey: c.contextKey,
          contextValue: c.contextValue,
          priority: c.priority,
        })),
        undefined,
        // provider
        userId,
        // userId
      );

      // Apply suggested rule updates
      for (const contextUpdate of analysis.updatedContexts) {
        // Validate contextKey is a valid ContextKey enum value
        const validContextKey = Object.values(ContextKey).includes(
          contextUpdate.contextKey as ContextKey,
        )
          ? (contextUpdate.contextKey as ContextKey)
          : null;

        if (!validContextKey) {
          this.logger.warn(
            `Invalid contextKey from LLM: ${contextUpdate.contextKey}`,
          );
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

      // Handle specific reason types
      if (reasonType === "wrong_sender_priority") {
        // If user says sender priority is wrong, adjust VIP status
        const senderName = email.fromName || email.from;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const existingVip = await this.userContextRepository.findOne({
          where: {
            userId,
            contextKey: ContextKey.VIP_CONTACT,
          },
        });

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
        if (
          reasonText.toLowerCase().includes("higher") ||
          reasonText.toLowerCase().includes("important")
        ) {
          if (!isVip) {
            await this.userContextRepository.save({
              userId,
              contextKey: ContextKey.VIP_CONTACT,
              contextValue: senderName,
              source: Source.USER_EDITED,
              explanation: `User override: ${reasonText}`,
            });
            this.logger.log(
              `Added ${senderName} as VIP based on override feedback`,
            );
          }
        }
      } else if (reasonType === "topic_mismatch") {
        // Extract topic/keywords from reason text and add to goals or working_on
        const topicMatch = reasonText.match(
          /(?:topic|about|regarding|concerning)[\s:]+(.+?)(?:\.|$)/i,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const emailText =
        `${email.subject || ""} ${email.body || ""}`.toLowerCase();

      // Extract patterns from email
      const patterns: string[] = [];

      // Add sender pattern
      if (senderName) {
        patterns.push(`from:${senderName.toLowerCase()}`);
      }

      // Extract keywords from subject
      const subjectWords = (email.subject || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      patterns.push(
        ...subjectWords.slice(0, QUERY_LIMITS.SUBJECT_WORDS_TOP_COUNT),
      );
      // Top 3 words

      // Create or update URGENT context entry
      const contextValue =
        urgencyScore >= PRIORITY_LEARNING_CONSTANTS.URGENCY_HIGH_THRESHOLD
          ? `High urgency (${urgencyScore}): ${senderName}`
          : `Urgency ${urgencyScore}: ${senderName}`;

      // Check if similar context already exists
      const existingContexts = await this.userContextRepository.find({
        where: {
          userId,
          contextKey: ContextKey.URGENT,
        },
      });

      // Check if we should update existing or create new
      const similarContext = existingContexts.find(
        (c) =>
          c.contextValue.toLowerCase().includes(senderName.toLowerCase()) ||
          senderName.toLowerCase().includes(c.contextValue.toLowerCase()),
      );

      if (similarContext) {
        // Update existing context
        similarContext.contextValue = contextValue;
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
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

      // If urgency score is very high (>=90), also consider adding as VIP
      if (urgencyScore >= PRIORITY_LEARNING_CONSTANTS.URGENCY_HIGH_THRESHOLD) {
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

      // Get current user context
      const currentContexts = await this.userContextRepository.find({
        where: { userId },
      });
      const contextSummary = currentContexts.slice(0, 10).map((c) => ({
        contextKey: c.contextKey,
        contextValue: c.contextValue,
        priority: c.priority,
      }));

      // Use LLM to analyze feedback and extract patterns
      const analysis = await this.llmService.analyzeOverrideReason(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        expectedPriority
          ? `Expected priority: ${expectedPriority}`
          : "Priority feedback",
        feedback,
        contextSummary,
        undefined,
        userId,
      );

      // Update or create context entries based on LLM analysis
      for (const contextUpdate of analysis.updatedContexts) {
        // Validate contextKey
        const validContextKey = Object.values(ContextKey).includes(
          contextUpdate.contextKey as ContextKey,
        )
          ? (contextUpdate.contextKey as ContextKey)
          : null;
        if (!validContextKey) {
          this.logger.warn(
            `Invalid contextKey from LLM: ${contextUpdate.contextKey}`,
          );
          continue;
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
          // Update existing context
          existing.priority = contextUpdate.priority || existing.priority;
          existing.explanation = `Learned from feedback: ${feedback.substring(0, 200)}`;
          existing.source = Source.USER_EDITED;
          // User provided feedback
          await this.userContextRepository.save(existing);
          updated.push({
            contextKey: validContextKey,
            contextValue: contextUpdate.contextValue,
            action: "updated",
          });
          this.logger.log(
            `Updated context: ${validContextKey} = "${contextUpdate.contextValue}"`,
          );
        } else {
          // Create new context
          const newContext = this.userContextRepository.create({
            userId,
            contextKey: validContextKey,
            contextValue: contextUpdate.contextValue,
            priority: contextUpdate.priority || 2,
            explanation: `Learned from feedback: ${feedback.substring(0, 200)}`,
            source: Source.USER_EDITED,
            // User provided feedback
          });
          await this.userContextRepository.save(newContext);
          updated.push({
            contextKey: validContextKey,
            contextValue: contextUpdate.contextValue,
            action: "created",
          });
          this.logger.log(
            `Created new context: ${validContextKey} = "${contextUpdate.contextValue}"`,
          );
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
}
