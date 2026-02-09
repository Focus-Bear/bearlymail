import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../database/entities/user.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import { AutoResponderSuppressionService } from "./auto-responder-suppression.service";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderAnalyticsService } from "./auto-responder-analytics.service";
import { AutoResponderPreviewService } from "./auto-responder-preview.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import {
  AutoResponderConfig,
  DEFAULT_AUTO_RESPONDER_CONFIG,
  AutoResponseTemplateVars,
} from "./types/auto-responder.types";
import {
  autoresponderLogger,
  AutoresponderDecisionContext,
} from "./autoresponder-logger";
import { PRIORITY_THRESHOLDS } from "./auto-responder-constants";

@Injectable()
export class AutoResponderService {
  private readonly logger = new Logger(AutoResponderService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private emailClassifierService: EmailClassifierService,
    private queueStatsService: QueueStatsService,
    private templateService: AutoResponderTemplateService,
    private suppressionService: AutoResponderSuppressionService,
    private qaService: AutoResponderQaService,
    private analyticsService: AutoResponderAnalyticsService,
    private previewService: AutoResponderPreviewService,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * Get user's auto-responder configuration
   */
  async getConfig(userId: string): Promise<AutoResponderConfig> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user?.autoResponderSettings) {
      return DEFAULT_AUTO_RESPONDER_CONFIG;
    }
    return { ...DEFAULT_AUTO_RESPONDER_CONFIG, ...user.autoResponderSettings };
  }

  /**
   * Update user's auto-responder configuration
   */
  async updateConfig(
    userId: string,
    config: Partial<AutoResponderConfig>,
  ): Promise<AutoResponderConfig> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const currentConfig =
      user.autoResponderSettings || DEFAULT_AUTO_RESPONDER_CONFIG;
    const newConfig = { ...currentConfig, ...config };

    await this.userRepository.update(userId, {
      autoResponderSettings: newConfig,
    });

    return newConfig;
  }

  /**
   * Main entry point: determine if auto-response should be sent and send it
   */
  async processEmailForAutoResponse(
    userId: string,
    emailThreadId: string,
    headers?: Record<string, string>,
  ): Promise<{ sent: boolean; reason: string }> {
    const logContext: AutoresponderDecisionContext = {
      userId,
      emailThreadId,
    };

    autoresponderLogger.logProcessingStart(logContext);

    const config = await this.getConfig(userId);

    // Log config check
    autoresponderLogger.logConfigCheck(logContext, config.enabled, {
      sendForHighPriority: config.sendFor.highPriority,
      sendForStandardPriority: config.sendFor.standardPriority,
      sendForLowPriority: config.sendFor.lowPriority,
      qaContextEnabled: config.qaContextEnabled,
      customExclusionRulesCount: config.customExclusionRules?.length || 0,
    });

    // Check if auto-responder is enabled
    if (!config.enabled) {
      const reason = "Auto-responder disabled";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
      });
      return { sent: false, reason };
    }

    // Get the email thread with emails
    const thread = await this.emailThreadRepository.findOne({
      where: { id: emailThreadId, userId },
      relations: ["emails"],
    });

    if (!thread || !thread.emails || thread.emails.length === 0) {
      const reason = "Thread or emails not found";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { threadFound: !!thread, emailCount: thread?.emails?.length },
      });
      return { sent: false, reason };
    }

    // Get the latest email in the thread (the one that triggered this)
    const latestEmail = thread.emails.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )[0];

    // Update log context with email details
    logContext.senderEmail = latestEmail.from;
    logContext.subject = latestEmail.subject;

    // Check if this is a new thread (only one email, no replies)
    const hasUserReplies = await this.threadHasUserReplies(userId, thread);
    if (hasUserReplies) {
      const reason = "Thread already has user replies";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { emailCount: thread.emails.length },
      });
      return { sent: false, reason };
    }

    // Check if we've already sent an auto-response to this thread
    const existingResponse = await this.analyticsService.hasExistingResponse(
      userId,
      emailThreadId,
    );
    if (existingResponse) {
      const reason = "Auto-response already sent to this thread";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { previousResponseId: existingResponse.id },
      });
      return { sent: false, reason };
    }

    // Check sender suppression (opt-out or cooldown)
    const senderEmailHash = this.suppressionService.hashEmail(latestEmail.from);
    const suppression = await this.suppressionService.checkSuppression(
      userId,
      senderEmailHash,
    );

    autoresponderLogger.logSuppressionCheck(
      logContext,
      !!suppression,
      suppression?.reason,
    );

    if (suppression) {
      const reason = `Sender suppressed: ${suppression.reason}`;
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: {
          suppressionReason: suppression.reason,
          suppressUntil: suppression.suppressUntil,
        },
      });
      return { sent: false, reason };
    }

    // Classify the email
    const classification = await this.emailClassifierService.classifyEmail(
      {
        from: latestEmail.from,
        fromName: latestEmail.fromName || undefined,
        subject: latestEmail.subject,
        body: latestEmail.body,
        htmlBody: latestEmail.htmlBody || undefined,
      },
      headers,
      hasUserReplies,
    );

    // Log classification results
    autoresponderLogger.logClassification(logContext, {
      isAutomated: classification.isAutomated,
      isNewsletter: classification.isNewsletter,
      isColdOutreach: classification.isColdOutreach,
      isBounce: classification.isBounce,
      isOutOfOffice: classification.isOutOfOffice,
      personalizationScore: classification.personalizationScore,
      reasons: classification.reasons,
    });

    // Always exclude bounce and out-of-office emails
    if (classification.isBounce) {
      const reason = "Bounce email excluded";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { classification: "bounce" },
      });
      return { sent: false, reason };
    }
    if (classification.isOutOfOffice) {
      const reason = "Out-of-office reply excluded";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { classification: "out-of-office" },
      });
      return { sent: false, reason };
    }

    // Check custom exclusion rules using AI
    if (config.customExclusionRules && config.customExclusionRules.length > 0) {
      const customExclusionResult =
        await this.emailClassifierService.checkCustomExclusionRules(
          {
            from: latestEmail.from,
            fromName: latestEmail.fromName || undefined,
            subject: latestEmail.subject,
            body: latestEmail.body,
          },
          config.customExclusionRules,
        );

      if (customExclusionResult.matched) {
        const reason = `Custom exclusion rule matched: ${customExclusionResult.matchedRule} (${customExclusionResult.reason})`;
        autoresponderLogger.logDecision(logContext, {
          decision: "SKIP",
          reason,
          details: {
            matchedRule: customExclusionResult.matchedRule,
            ruleReason: customExclusionResult.reason,
          },
        });
        return { sent: false, reason };
      }
    }

    // Determine priority level from thread
    const priorityLevel = this.determinePriorityLevel(thread);

    // Log priority check
    autoresponderLogger.logPriorityCheck(
      logContext,
      priorityLevel,
      thread.starCount,
      thread.urgencyScore,
      {
        sendForHighPriority: config.sendFor.highPriority,
        sendForStandardPriority: config.sendFor.standardPriority,
        sendForLowPriority: config.sendFor.lowPriority,
      },
    );

    // Check if we should send for this priority level
    if (priorityLevel === "high" && !config.sendFor.highPriority) {
      const reason = "High priority auto-response disabled";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { priorityLevel, configSetting: "sendFor.highPriority=false" },
      });
      return { sent: false, reason };
    }
    if (priorityLevel === "medium" && !config.sendFor.standardPriority) {
      const reason = "Standard priority auto-response disabled";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: {
          priorityLevel,
          configSetting: "sendFor.standardPriority=false",
        },
      });
      return { sent: false, reason };
    }
    if (priorityLevel === "low" && !config.sendFor.lowPriority) {
      const reason = "Low priority auto-response disabled";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: { priorityLevel, configSetting: "sendFor.lowPriority=false" },
      });
      return { sent: false, reason };
    }

    // Get user info and queue stats
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      const reason = "User not found";
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
      });
      return { sent: false, reason };
    }

    const queueStats = await this.queueStatsService.getQueueStats(userId);

    // Get category-specific response time if available
    const categoryResponseTime =
      this.queueStatsService.getResponseTimeForCategory(
        queueStats,
        thread.category,
      );

    // Generate Q&A answer if enabled
    let qaResult = null;
    if (config.qaContextEnabled) {
      qaResult = await this.qaService.generateQAAnswer(
        userId,
        latestEmail.subject,
        latestEmail.body,
        config.qaMinConfidence,
      );
    }

    // Render the response
    const templateVars: AutoResponseTemplateVars = {
      userName: user.name || "the recipient",
      senderName: latestEmail.fromName || latestEmail.from.split("@")[0],
      originalSubject: latestEmail.subject,
      priorityLevel,
      actionCount: queueStats.actionCount,
      triageCount: queueStats.triageCount,
      avgResponseTime: categoryResponseTime,
      urgentResponseTime: queueStats.urgentResponseTime,
      aiAnswer: qaResult?.answer || null,
      hasAiAnswer: !!qaResult && qaResult.confidence >= config.qaMinConfidence,
    };

    const template = this.templateService.selectTemplate(
      config,
      priorityLevel,
      queueStats,
    );
    const templateUsed = this.templateService.getTemplateType(config, template);
    const responseBody = this.templateService.renderTemplate(
      template,
      templateVars,
    );
    const responseSubject = `Re: ${latestEmail.subject} - BearlyMail Auto-Response`;

    // Convert markdown to HTML for proper email formatting
    const responseHtmlBody = this.templateService.markdownToHtml(responseBody);

    // Log send attempt
    autoresponderLogger.logSendAttempt(
      logContext,
      templateUsed,
      responseSubject,
    );

    // Send the auto-response
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        const reason = "No email provider connected";
        autoresponderLogger.logSendError(
          logContext,
          new Error(reason),
          "get_provider",
        );
        autoresponderLogger.logDecision(logContext, {
          decision: "SKIP",
          reason,
        });
        return { sent: false, reason };
      }

      // Use Reply-To address if available, otherwise fall back to From address
      const replyToAddress = latestEmail.replyTo || latestEmail.from;

      await provider.sendReply(
        userId,
        thread.threadId,
        replyToAddress,
        responseSubject,
        responseBody,
        undefined,
        responseHtmlBody,
      );

      // Log the auto-response
      await this.analyticsService.logAutoResponse(
        userId,
        emailThreadId,
        senderEmailHash,
        priorityLevel,
        qaResult,
        templateUsed,
        responseSubject,
        responseBody,
        classification,
      );

      // Add cooldown suppression for this sender
      await this.suppressionService.addCooldownSuppression(
        userId,
        senderEmailHash,
        config.cooldownPeriodDays,
      );

      // Log success
      autoresponderLogger.logSendSuccess(logContext, templateUsed, !!qaResult);
      autoresponderLogger.logDecision(logContext, {
        decision: "SEND",
        reason: "Auto-response sent successfully",
        details: {
          templateUsed,
          priorityLevel,
          qaAnswerProvided: !!qaResult,
          recipient: latestEmail.from,
        },
      });

      this.logger.log(
        `Auto-response sent for thread ${emailThreadId} to ${latestEmail.from}`,
      );

      return { sent: true, reason: "Auto-response sent successfully" };
    } catch (error) {
      autoresponderLogger.logSendError(logContext, error, "send_reply");
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: `Send failed: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      });

      this.logger.error(
        `Failed to send auto-response for thread ${emailThreadId}`,
        error,
      );
      return {
        sent: false,
        reason: `Send failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check if thread has any replies from the user
   */
  private async threadHasUserReplies(
    userId: string,
    thread: EmailThread,
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return false;

    const userEmail = user.email.toLowerCase();
    return thread.emails.some(
      (email) => email.from.toLowerCase() === userEmail,
    );
  }

  /**
   * Determine priority level from thread's star count and urgency
   */
  private determinePriorityLevel(
    thread: EmailThread | null,
  ): "low" | "medium" | "high" {
    if (!thread) {
      return "medium";
    }
    if (
      thread.starCount >= PRIORITY_THRESHOLDS.HIGH_PRIORITY_STARS ||
      thread.urgencyScore >= PRIORITY_THRESHOLDS.HIGH_URGENCY
    ) {
      return "high";
    }
    if (
      thread.starCount === PRIORITY_THRESHOLDS.LOW_PRIORITY_STARS ||
      thread.urgencyScore < PRIORITY_THRESHOLDS.LOW_URGENCY
    ) {
      return "low";
    }
    return "medium";
  }

  // === Delegated methods to extracted services ===

  /**
   * Add opt-out suppression for a sender
   */
  async addOptOutSuppression(
    userId: string,
    senderEmail: string,
    notes?: string,
  ): Promise<void> {
    return this.suppressionService.addOptOutSuppression(
      userId,
      senderEmail,
      notes,
    );
  }

  /**
   * Remove opt-out suppression for a sender
   */
  async removeOptOutSuppression(
    userId: string,
    senderEmail: string,
  ): Promise<void> {
    return this.suppressionService.removeOptOutSuppression(userId, senderEmail);
  }

  /**
   * Get analytics for auto-responses
   */
  async getAnalytics(
    userId: string,
    dateRange?: { start: Date; end: Date },
  ): Promise<{
    totalSent: number;
    byPriority: { low: number; medium: number; high: number };
    qaAnswerRate: number;
    escalationRate: number;
    templateBreakdown: Record<string, number>;
  }> {
    return this.analyticsService.getAnalytics(userId, dateRange);
  }

  /**
   * Preview auto-response with sample data
   */
  async previewAutoResponse(
    userId: string,
    templateType: "standard" | "highPriority" | "lowPriority" | "zeroBacklog",
  ): Promise<{ subject: string; body: string }> {
    const config = await this.getConfig(userId);
    return this.previewService.previewAutoResponse(
      userId,
      templateType,
      config,
    );
  }

  /**
   * Preview auto-response for a specific email
   */
  async previewAutoResponseForEmail(
    userId: string,
    emailId: string,
  ): Promise<{
    subject: string;
    body: string;
    templateUsed: string;
    priorityLevel: string;
    senderName: string;
    originalSubject: string;
  }> {
    const config = await this.getConfig(userId);
    return this.previewService.previewAutoResponseForEmail(
      userId,
      emailId,
      config,
    );
  }

  /**
   * Get recent emails for preview selection
   */
  async getRecentEmailsForPreview(
    userId: string,
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      from: string;
      fromName: string | null;
      subject: string;
      receivedAt: Date;
      priorityScore: number | null;
    }>
  > {
    return this.previewService.getRecentEmailsForPreview(userId, limit);
  }
}
