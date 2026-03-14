import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { AutoResponderAnalyticsService } from "./auto-responder-analytics.service";
import {
  EMAIL_AGE_CONFIG,
  PRIORITY_THRESHOLDS,
} from "./auto-responder-constants";
import { AutoResponderContextService } from "./auto-responder-context.service";
import { AutoResponderPreviewService } from "./auto-responder-preview.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import {
  AutoresponderDecisionContext,
  autoresponderLogger,
} from "./autoresponder-logger";
import {
  AutoResponderConfig,
  AutoResponseTemplateVars,
  DEFAULT_AUTO_RESPONDER_CONFIG,
  EmailClassification,
} from "./types/auto-responder.types";

type PreparedResponse = {
  senderEmailHash: string;
  priorityLevel: "low" | "medium" | "high";
  qaResult: { answer: string; confidence: number } | null;
  templateUsed: string;
  responseBody: string;
  responseSubject: string;
  responseHtmlBody: string;
  classification: EmailClassification;
};

@Injectable()
export class AutoResponderService {
  private readonly logger = new Logger(AutoResponderService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private contextService: AutoResponderContextService,
    private templateService: AutoResponderTemplateService,
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

    autoresponderLogger.logConfigCheck(logContext, config.enabled, {
      sendForHighPriority: config.sendFor.highPriority,
      sendForStandardPriority: config.sendFor.standardPriority,
      sendForLowPriority: config.sendFor.lowPriority,
      qaContextEnabled: config.qaContextEnabled,
      customExclusionRulesCount: config.customExclusionRules?.length || 0,
    });

    if (!config.enabled) {
      const reason = "Auto-responder disabled";
      autoresponderLogger.logDecision(logContext, { decision: "SKIP", reason });
      return { sent: false, reason };
    }

    const earlySkip = await this.checkEarlySkipConditions(
      userId,
      emailThreadId,
      logContext,
    );
    if (earlySkip) return earlySkip;

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

    const latestEmail = thread.emails.sort(
      (emailA, emailB) =>
        new Date(emailB.receivedAt).getTime() -
        new Date(emailA.receivedAt).getTime(),
    )[0];

    logContext.senderEmail = latestEmail.from;
    logContext.subject = latestEmail.subject;

    const emailAgeCheck = this.checkEmailAge(
      latestEmail.receivedAt,
      logContext,
    );
    if (emailAgeCheck) return emailAgeCheck;

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

    const { skip: classificationSkip, classification } =
      await this.checkClassificationSkip(
        logContext,
        config,
        latestEmail,
        headers,
        hasUserReplies,
      );
    if (classificationSkip) return classificationSkip;

    const prioritySkip = this.checkPrioritySkip(logContext, config, thread);
    if (prioritySkip) return prioritySkip;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      const reason = "User not found";
      autoresponderLogger.logDecision(logContext, { decision: "SKIP", reason });
      return { sent: false, reason };
    }

    const priorityLevel = this.determinePriorityLevel(thread);
    return this.buildAndSendResponse(
      logContext,
      config,
      thread,
      latestEmail,
      user,
      emailThreadId,
      { priorityLevel, classification: classification! },
    );
  }

  private async checkEarlySkipConditions(
    userId: string,
    emailThreadId: string,
    logContext: AutoresponderDecisionContext,
  ): Promise<{ sent: boolean; reason: string } | null> {
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
    return null;
  }

  private async checkClassificationSkip(
    logContext: AutoresponderDecisionContext,
    config: AutoResponderConfig,
    latestEmail: {
      from: string;
      fromName: string | null;
      subject: string;
      body: string;
      htmlBody: string | null;
    },
    headers: Record<string, string> | undefined,
    hasUserReplies: boolean,
  ): Promise<{
    skip: { sent: boolean; reason: string } | null;
    classification: EmailClassification | null;
  }> {
    const senderEmailHash = this.contextService.hashEmail(latestEmail.from);
    const suppression = await this.contextService.checkSuppression(
      logContext.userId!,
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
      return { skip: { sent: false, reason }, classification: null };
    }

    const classification = await this.contextService.classifyEmail(
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

    autoresponderLogger.logClassification(logContext, {
      isAutomated: classification.isAutomated,
      isNewsletter: classification.isNewsletter,
      isColdOutreach: classification.isColdOutreach,
      isBounce: classification.isBounce,
      isOutOfOffice: classification.isOutOfOffice,
      personalizationScore: classification.personalizationScore,
      reasons: classification.reasons,
    });

    if (classification.isBounce) {
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: "Bounce email excluded",
        details: { classification: "bounce" },
      });
      return {
        skip: { sent: false, reason: "Bounce email excluded" },
        classification: null,
      };
    }
    if (classification.isOutOfOffice) {
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: "Out-of-office reply excluded",
        details: { classification: "out-of-office" },
      });
      return {
        skip: { sent: false, reason: "Out-of-office reply excluded" },
        classification: null,
      };
    }

    if (config.customExclusionRules && config.customExclusionRules.length > 0) {
      const customExclusionResult =
        await this.contextService.checkCustomExclusionRules(
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
        return { skip: { sent: false, reason }, classification: null };
      }
    }

    return { skip: null, classification };
  }

  private checkPrioritySkip(
    logContext: AutoresponderDecisionContext,
    config: AutoResponderConfig,
    thread: EmailThread,
  ): { sent: boolean; reason: string } | null {
    const priorityLevel = this.determinePriorityLevel(thread);
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

    if (priorityLevel === "high" && !config.sendFor.highPriority) {
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: "High priority auto-response disabled",
        details: { priorityLevel, configSetting: "sendFor.highPriority=false" },
      });
      return { sent: false, reason: "High priority auto-response disabled" };
    }
    if (priorityLevel === "medium" && !config.sendFor.standardPriority) {
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: "Standard priority auto-response disabled",
        details: {
          priorityLevel,
          configSetting: "sendFor.standardPriority=false",
        },
      });
      return {
        sent: false,
        reason: "Standard priority auto-response disabled",
      };
    }
    if (priorityLevel === "low" && !config.sendFor.lowPriority) {
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason: "Low priority auto-response disabled",
        details: { priorityLevel, configSetting: "sendFor.lowPriority=false" },
      });
      return { sent: false, reason: "Low priority auto-response disabled" };
    }
    return null;
  }

  /**
   * Check if email is too old to auto-respond to.
   * This prevents auto-responding to snoozed emails that return to inbox
   * after the original email was received more than 24 hours ago.
   */
  private checkEmailAge(
    receivedAt: Date,
    logContext: AutoresponderDecisionContext,
  ): { sent: boolean; reason: string } | null {
    const now = new Date();
    const ageInHours =
      (now.getTime() - receivedAt.getTime()) / MILLISECONDS.HOUR;

    if (ageInHours > EMAIL_AGE_CONFIG.MAX_EMAIL_AGE_HOURS) {
      const roundedAge = Math.round(ageInHours * 10) / 10;
      const reason = `Email too old for auto-response (${roundedAge} hours old, max ${EMAIL_AGE_CONFIG.MAX_EMAIL_AGE_HOURS} hours)`;
      autoresponderLogger.logDecision(logContext, {
        decision: "SKIP",
        reason,
        details: {
          emailAgeHours: roundedAge,
          maxAgeHours: EMAIL_AGE_CONFIG.MAX_EMAIL_AGE_HOURS,
          receivedAt: receivedAt.toISOString(),
        },
      });
      return { sent: false, reason };
    }
    return null;
  }

  private async buildAndSendResponse(
    logContext: AutoresponderDecisionContext,
    config: AutoResponderConfig,
    thread: EmailThread,
    latestEmail: {
      from: string;
      fromName: string | null;
      subject: string;
      body: string;
      htmlBody: string | null;
      replyTo: string | null;
    },
    user: User,
    emailThreadId: string,
    priorityAndClassification: {
      priorityLevel: "low" | "medium" | "high";
      classification: EmailClassification;
    },
  ): Promise<{ sent: boolean; reason: string }> {
    const { priorityLevel, classification } = priorityAndClassification;
    const senderEmailHash = this.contextService.hashEmail(latestEmail.from);
    const queueStats = await this.contextService.getQueueStats(user.id);
    const categoryResponseTime = this.contextService.getResponseTimeForCategory(
      queueStats,
      thread.category,
    );

    let qaResult = null;
    if (config.qaContextEnabled) {
      qaResult = await this.contextService.generateQAAnswer(
        user.id,
        latestEmail.subject,
        latestEmail.body,
        config.qaMinConfidence,
      );
    }

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
    const responseHtmlBody = this.templateService.markdownToHtml(responseBody);

    const prepared: PreparedResponse = {
      senderEmailHash,
      priorityLevel,
      qaResult,
      templateUsed,
      responseBody,
      responseSubject,
      responseHtmlBody,
      classification,
    };

    autoresponderLogger.logSendAttempt(
      logContext,
      templateUsed,
      responseSubject,
    );

    return this.sendAutoResponse(
      logContext,
      config,
      thread,
      latestEmail,
      user.id,
      emailThreadId,
      prepared,
    );
  }

  private async sendAutoResponse(
    logContext: AutoresponderDecisionContext,
    config: AutoResponderConfig,
    thread: EmailThread,
    latestEmail: { from: string; replyTo: string | null },
    userId: string,
    emailThreadId: string,
    prepared: PreparedResponse,
  ): Promise<{ sent: boolean; reason: string }> {
    const {
      senderEmailHash,
      priorityLevel,
      qaResult,
      templateUsed,
      responseBody,
      responseSubject,
      responseHtmlBody,
      classification,
    } = prepared;
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

      const replyToAddress = latestEmail.replyTo || latestEmail.from;
      await provider.sendReply(
        userId,
        thread.threadId,
        replyToAddress,
        responseSubject,
        responseBody,
        { htmlBody: responseHtmlBody },
      );

      await this.analyticsService.logAutoResponse({
        userId,
        emailThreadId,
        senderEmailHash,
        priorityLevel,
        qaResult: qaResult
          ? {
              answer: qaResult.answer,
              confidence: qaResult.confidence,
              sources:
                (
                  qaResult as {
                    sources?: Array<{ question: string; answer: string }>;
                  }
                ).sources || [],
            }
          : { answer: "", confidence: 0, sources: [] },
        templateUsed,
        responseSubject,
        responseBody,
        classification,
      });

      // Guard the thread from Gmail sync archiving. When we send an auto-reply, Gmail may
      // remove the INBOX label from the thread (because a reply was sent), which causes
      // the BearlyMail sync job to set isArchived=true — making the email invisible to
      // the user. Setting lastAutoRespondedAt marks the thread so batchUpdateThreadArchivedStatuses
      // will skip it for 24 hours, preserving inbox visibility.
      await this.emailThreadRepository.update(
        { id: emailThreadId },
        { lastAutoRespondedAt: new Date() },
      );

      await this.contextService.addCooldownSuppression(
        userId,
        senderEmailHash,
        config.cooldownPeriodDays,
      );

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
    return this.contextService.addOptOutSuppression(userId, senderEmail, notes);
  }

  /**
   * Remove opt-out suppression for a sender
   */
  async removeOptOutSuppression(
    userId: string,
    senderEmail: string,
  ): Promise<void> {
    return this.contextService.removeOptOutSuppression(userId, senderEmail);
  }

  /**
   * Get auto-responded threads for the autoresponded inbox mode
   */
  async getAutoRespondedThreads(
    userId: string,
    filters?: {
      categories?: string[];
      minPriority?: number;
      accountIds?: string[];
      offset?: number;
      limit?: number;
    },
  ) {
    return this.analyticsService.getAutoRespondedThreads(userId, filters);
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
