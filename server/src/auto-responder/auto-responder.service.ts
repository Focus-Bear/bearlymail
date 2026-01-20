import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull } from "typeorm";
import * as crypto from "crypto";
import { User } from "../database/entities/user.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { UserContext, ContextKey } from "../database/entities/user-context.entity";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { LLMService } from "../llm/llm.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { getPrompt, renderPrompt } from "../llm/prompts";
import {
  AutoResponderConfig,
  DEFAULT_AUTO_RESPONDER_CONFIG,
  EmailClassification,
  QueueStats,
  QASearchResult,
  AutoResponseTemplateVars,
  AutoResponseLogPriority,
  SuppressionReason,
} from "./types/auto-responder.types";
import { RATIOS } from "../constants/percentages";
import { DAYS } from "../constants/time-constants";

const LLM_OP_GENERATE_QA_ANSWER = "generate_qa_answer";

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
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
    @InjectRepository(AutoResponseSuppression)
    private autoResponseSuppressionRepository: Repository<AutoResponseSuppression>,
    private emailClassifierService: EmailClassifierService,
    private queueStatsService: QueueStatsService,
    @Inject(forwardRef(() => LLMService))
    private llmService: LLMService,
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

    const currentConfig = user.autoResponderSettings || DEFAULT_AUTO_RESPONDER_CONFIG;
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
    const config = await this.getConfig(userId);

    // Check if auto-responder is enabled
    if (!config.enabled) {
      return { sent: false, reason: "Auto-responder disabled" };
    }

    // Get the email thread with emails
    const thread = await this.emailThreadRepository.findOne({
      where: { id: emailThreadId, userId },
      relations: ["emails"],
    });

    if (!thread || !thread.emails || thread.emails.length === 0) {
      return { sent: false, reason: "Thread or emails not found" };
    }

    // Get the latest email in the thread (the one that triggered this)
    const latestEmail = thread.emails.sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )[0];

    // Check if this is a new thread (only one email, no replies)
    const hasUserReplies = await this.threadHasUserReplies(userId, thread);
    if (hasUserReplies) {
      return { sent: false, reason: "Thread already has user replies" };
    }

    // Check if we've already sent an auto-response to this thread
    const existingResponse = await this.autoResponseLogRepository.findOne({
      where: { userId, emailThreadId },
    });
    if (existingResponse) {
      return { sent: false, reason: "Auto-response already sent to this thread" };
    }

    // Check sender suppression (opt-out or cooldown)
    const senderEmailHash = this.hashEmail(latestEmail.from);
    const suppression = await this.checkSuppression(userId, senderEmailHash);
    if (suppression) {
      return { sent: false, reason: `Sender suppressed: ${suppression.reason}` };
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

    // Check exclusion rules
    if (config.excludeAutomated && classification.isAutomated) {
      return { sent: false, reason: "Automated email excluded" };
    }
    if (config.excludeNewsletters && classification.isNewsletter) {
      return { sent: false, reason: "Newsletter excluded" };
    }
    if (config.excludeColdOutreach && classification.isColdOutreach) {
      return { sent: false, reason: "Cold outreach excluded" };
    }
    if (classification.isBounce) {
      return { sent: false, reason: "Bounce email excluded" };
    }
    if (classification.isOutOfOffice) {
      return { sent: false, reason: "Out-of-office reply excluded" };
    }

    // Determine priority level from thread
    const priorityLevel = this.determinePriorityLevel(thread);

    // Check if we should send for this priority level
    if (priorityLevel === "high" && !config.sendFor.highPriority) {
      return { sent: false, reason: "High priority auto-response disabled" };
    }
    if (priorityLevel === "medium" && !config.sendFor.standardPriority) {
      return { sent: false, reason: "Standard priority auto-response disabled" };
    }
    if (priorityLevel === "low" && !config.sendFor.lowPriority) {
      return { sent: false, reason: "Low priority auto-response disabled" };
    }

    // Get user info and queue stats
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return { sent: false, reason: "User not found" };
    }

    const queueStats = await this.queueStatsService.getQueueStats(userId);

    // Generate Q&A answer if enabled
    let qaResult: QASearchResult | null = null;
    if (config.qaContextEnabled) {
      qaResult = await this.generateQAAnswer(
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
      avgResponseTime: queueStats.avgResponseTime,
      urgentResponseTime: queueStats.urgentResponseTime,
      aiAnswer: qaResult?.answer || null,
      hasAiAnswer: !!qaResult && qaResult.confidence >= config.qaMinConfidence,
    };

    const template = this.selectTemplate(config, priorityLevel, queueStats);
    const responseBody = this.renderTemplate(template, templateVars);
    const responseSubject = `Re: ${latestEmail.subject} - BearlyMail Auto-Response`;

    // Send the auto-response
    try {
      const provider = await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        return { sent: false, reason: "No email provider connected" };
      }

      await provider.sendReply(
        userId,
        thread.threadId,
        latestEmail.from,
        responseSubject,
        responseBody,
      );

      // Log the auto-response
      await this.logAutoResponse(
        userId,
        emailThreadId,
        senderEmailHash,
        priorityLevel,
        qaResult,
        template === config.templates.highPriority
          ? "highPriority"
          : template === config.templates.lowPriority
            ? "lowPriority"
            : template === config.templates.zeroBacklog
              ? "zeroBacklog"
              : "standard",
        responseSubject,
        responseBody,
        classification,
      );

      // Add cooldown suppression for this sender
      await this.addCooldownSuppression(userId, senderEmailHash, config.cooldownPeriodDays);

      this.logger.log(
        `Auto-response sent for thread ${emailThreadId} to ${latestEmail.from}`,
      );

      return { sent: true, reason: "Auto-response sent successfully" };
    } catch (error) {
      this.logger.error(
        `Failed to send auto-response for thread ${emailThreadId}`,
        error,
      );
      return { sent: false, reason: `Send failed: ${(error as Error).message}` };
    }
  }

  /**
   * Check if thread has any replies from the user
   */
  private async threadHasUserReplies(
    userId: string,
    thread: EmailThread,
  ): Promise<boolean> {
    // Check if any email in the thread was sent by the user
    // This would be indicated by being in the SENT label or by checking the from address
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return false;

    const userEmail = user.email.toLowerCase();
    return thread.emails.some(
      (email) => email.from.toLowerCase() === userEmail,
    );
  }

  /**
   * Hash an email address for storage/lookup
   */
  private hashEmail(email: string): string {
    return crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }

  /**
   * Check if sender is suppressed
   */
  private async checkSuppression(
    userId: string,
    senderEmailHash: string,
  ): Promise<AutoResponseSuppression | null> {
    const now = new Date();

    // Check for permanent suppression (opt-out)
    const permanentSuppression = await this.autoResponseSuppressionRepository.findOne({
      where: {
        userId,
        senderEmailHash,
        reason: SuppressionReason.OPT_OUT,
      },
    });
    if (permanentSuppression) {
      return permanentSuppression;
    }

    // Check for active cooldown
    const cooldownSuppression = await this.autoResponseSuppressionRepository.findOne({
      where: {
        userId,
        senderEmailHash,
        reason: SuppressionReason.COOLDOWN,
        suppressUntil: MoreThan(now),
      },
    });

    return cooldownSuppression;
  }

  /**
   * Add cooldown suppression for a sender
   */
  private async addCooldownSuppression(
    userId: string,
    senderEmailHash: string,
    cooldownDays: number,
  ): Promise<void> {
    const suppressUntil = new Date();
    suppressUntil.setDate(suppressUntil.getDate() + cooldownDays);

    // Remove existing cooldown for this sender
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
      reason: SuppressionReason.COOLDOWN,
    });

    // Add new cooldown
    await this.autoResponseSuppressionRepository.save({
      userId,
      senderEmailHash,
      reason: SuppressionReason.COOLDOWN,
      suppressUntil,
      notes: `Auto-response cooldown for ${cooldownDays} days`,
    });
  }

  /**
   * Determine priority level from thread's star count and urgency
   */
  private determinePriorityLevel(thread: EmailThread): "low" | "medium" | "high" {
    // High priority: 3 stars or high urgency score
    if (thread.starCount >= 3 || thread.urgencyScore >= 70) {
      return "high";
    }
    // Low priority: 1 star or low urgency
    if (thread.starCount === 1 || thread.urgencyScore < 30) {
      return "low";
    }
    // Medium priority: default
    return "medium";
  }

  /**
   * Select the appropriate template based on priority and queue state
   */
  private selectTemplate(
    config: AutoResponderConfig,
    priorityLevel: "low" | "medium" | "high",
    queueStats: QueueStats,
  ): string {
    // Check for zero backlog
    if (queueStats.actionCount === 0 && queueStats.triageCount === 0) {
      return config.templates.zeroBacklog;
    }

    // Select by priority
    switch (priorityLevel) {
      case "high":
        return config.templates.highPriority;
      case "low":
        return config.templates.lowPriority;
      default:
        return config.templates.standard;
    }
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, vars: AutoResponseTemplateVars): string {
    let result = template;

    // Simple variable replacement
    result = result.replace(/\{\{userName\}\}/g, vars.userName);
    result = result.replace(/\{\{senderName\}\}/g, vars.senderName);
    result = result.replace(/\{\{originalSubject\}\}/g, vars.originalSubject);
    result = result.replace(/\{\{priorityLevel\}\}/g, vars.priorityLevel);
    result = result.replace(/\{\{actionCount\}\}/g, String(vars.actionCount > 100 ? "100+" : vars.actionCount));
    result = result.replace(/\{\{triageCount\}\}/g, String(vars.triageCount > 100 ? "100+" : vars.triageCount));
    result = result.replace(/\{\{avgResponseTime\}\}/g, vars.avgResponseTime);
    result = result.replace(/\{\{urgentResponseTime\}\}/g, vars.urgentResponseTime);
    result = result.replace(/\{\{aiAnswer\}\}/g, vars.aiAnswer || "");

    // Handle conditional blocks
    // {{#if hasAiAnswer}}...{{/if}}
    result = result.replace(
      /\{\{#if hasAiAnswer\}\}([\s\S]*?)\{\{\/if\}\}/g,
      vars.hasAiAnswer ? "$1" : "",
    );

    // {{#unless hasAiAnswer}}...{{/unless}}
    result = result.replace(
      /\{\{#unless hasAiAnswer\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      vars.hasAiAnswer ? "" : "$1",
    );

    return result.trim();
  }

  /**
   * Generate Q&A answer from user's context
   */
  private async generateQAAnswer(
    userId: string,
    subject: string,
    body: string,
    minConfidence: number,
  ): Promise<QASearchResult | null> {
    try {
      // Get Q&A context entries
      const qaContexts = await this.userContextRepository.find({
        where: {
          userId,
          contextKey: ContextKey.Q_AND_A,
        },
      });

      if (qaContexts.length === 0) {
        return null;
      }

      // Parse Q&A pairs from context
      const qaPairs: Array<{ question: string; answer: string }> = [];
      for (const ctx of qaContexts) {
        try {
          const parsed = JSON.parse(ctx.contextValue);
          if (parsed.question && parsed.answer) {
            qaPairs.push(parsed);
          }
        } catch {
          // If not JSON, try to parse as "Q: ... A: ..." format
          const match = ctx.contextValue.match(/Q:\s*(.*?)\s*A:\s*(.*)/is);
          if (match) {
            qaPairs.push({ question: match[1].trim(), answer: match[2].trim() });
          }
        }
      }

      if (qaPairs.length === 0) {
        return null;
      }

      // Use LLM to find relevant answer
      const promptConfig = getPrompt("generate_qa_answer");
      if (!promptConfig) {
        this.logger.warn("generate_qa_answer prompt not found");
        return null;
      }

      const prompt = renderPrompt(promptConfig.prompt || "", {
        subject,
        body: body.substring(0, 1500),
        qaPairs: qaPairs.map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`).join("\n\n"),
      });

      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: 500,
        },
        undefined,
        userId,
        LLM_OP_GENERATE_QA_ANSWER as any,
      );

      // Parse response
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.confidence >= minConfidence && parsed.answer) {
            return {
              answer: parsed.answer,
              confidence: parsed.confidence,
              sources: parsed.sources || [],
            };
          }
        }
      } catch (parseError) {
        this.logger.warn("Failed to parse Q&A response", parseError);
      }

      return null;
    } catch (error) {
      this.logger.error("Failed to generate Q&A answer", error);
      return null;
    }
  }

  /**
   * Log an auto-response
   */
  private async logAutoResponse(
    userId: string,
    emailThreadId: string,
    senderEmailHash: string,
    priorityLevel: "low" | "medium" | "high",
    qaResult: QASearchResult | null,
    templateUsed: string,
    responseSubject: string,
    responseBody: string,
    classification: EmailClassification,
  ): Promise<void> {
    await this.autoResponseLogRepository.save({
      userId,
      emailThreadId,
      senderEmailHash,
      priorityLevel: priorityLevel as AutoResponseLogPriority,
      qaAnswerProvided: !!qaResult,
      confidenceScore: qaResult?.confidence || null,
      templateUsed,
      responseSubject,
      responseBody,
      classificationDetails: {
        isAutomated: classification.isAutomated,
        isNewsletter: classification.isNewsletter,
        isColdOutreach: classification.isColdOutreach,
        personalizationScore: classification.personalizationScore,
        reasons: classification.reasons,
      },
    });
  }

  /**
   * Add opt-out suppression for a sender
   */
  async addOptOutSuppression(
    userId: string,
    senderEmail: string,
    notes?: string,
  ): Promise<void> {
    const senderEmailHash = this.hashEmail(senderEmail);

    // Remove any existing suppressions for this sender
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
    });

    // Add permanent opt-out
    await this.autoResponseSuppressionRepository.save({
      userId,
      senderEmailHash,
      reason: SuppressionReason.OPT_OUT,
      suppressUntil: null, // Permanent
      notes: notes || "User requested opt-out",
    });
  }

  /**
   * Remove opt-out suppression for a sender
   */
  async removeOptOutSuppression(userId: string, senderEmail: string): Promise<void> {
    const senderEmailHash = this.hashEmail(senderEmail);
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
      reason: SuppressionReason.OPT_OUT,
    });
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
    const queryBuilder = this.autoResponseLogRepository
      .createQueryBuilder("log")
      .where("log.userId = :userId", { userId });

    if (dateRange) {
      queryBuilder
        .andWhere("log.sentAt >= :start", { start: dateRange.start })
        .andWhere("log.sentAt <= :end", { end: dateRange.end });
    }

    const logs = await queryBuilder.getMany();

    const totalSent = logs.length;
    const byPriority = {
      low: logs.filter((l) => l.priorityLevel === AutoResponseLogPriority.LOW).length,
      medium: logs.filter((l) => l.priorityLevel === AutoResponseLogPriority.MEDIUM).length,
      high: logs.filter((l) => l.priorityLevel === AutoResponseLogPriority.HIGH).length,
    };
    const qaAnswerCount = logs.filter((l) => l.qaAnswerProvided).length;
    const escalationCount = logs.filter((l) => l.escalationRequested).length;

    const templateBreakdown: Record<string, number> = {};
    for (const log of logs) {
      templateBreakdown[log.templateUsed] = (templateBreakdown[log.templateUsed] || 0) + 1;
    }

    return {
      totalSent,
      byPriority,
      qaAnswerRate: totalSent > 0 ? qaAnswerCount / totalSent : 0,
      escalationRate: totalSent > 0 ? escalationCount / totalSent : 0,
      templateBreakdown,
    };
  }

  /**
   * Preview auto-response with sample data
   */
  async previewAutoResponse(
    userId: string,
    templateType: "standard" | "highPriority" | "lowPriority" | "zeroBacklog",
  ): Promise<{ subject: string; body: string }> {
    const config = await this.getConfig(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const queueStats = await this.queueStatsService.getQueueStats(userId);

    const sampleVars: AutoResponseTemplateVars = {
      userName: user?.name || "Your Name",
      senderName: "John Smith",
      originalSubject: "Question about your project",
      priorityLevel: templateType === "highPriority" ? "high" : templateType === "lowPriority" ? "low" : "medium",
      actionCount: queueStats.actionCount || 37,
      triageCount: queueStats.triageCount || 21,
      avgResponseTime: queueStats.avgResponseTime || "~4 days",
      urgentResponseTime: queueStats.urgentResponseTime || "12-24 hours",
      aiAnswer: "Based on previous conversations, the project timeline is approximately 3-4 weeks from kickoff to delivery.",
      hasAiAnswer: true,
    };

    const template = config.templates[templateType];
    const body = this.renderTemplate(template, sampleVars);

    return {
      subject: `Re: ${sampleVars.originalSubject} - BearlyMail Auto-Response`,
      body,
    };
  }
}
