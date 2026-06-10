import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AUTO_RESPONDER_TEMPLATE_TYPES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import {
  PREVIEW_DEFAULTS,
  PRIORITY_THRESHOLDS,
} from "./auto-responder-constants";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import { QueueStatsService } from "./queue-stats.service";
import {
  AutoResponderConfig,
  AutoResponseTemplateVars,
} from "./types/auto-responder.types";

function getPriorityLevel(templateType: string): "low" | "medium" | "high" {
  if (templateType === AUTO_RESPONDER_TEMPLATE_TYPES.HIGH_PRIORITY) {
    return "high";
  }
  if (templateType === AUTO_RESPONDER_TEMPLATE_TYPES.LOW_PRIORITY) {
    return "low";
  }
  return "medium";
}

/**
 * Service for previewing auto-responses
 */
@Injectable()
export class AutoResponderPreviewService {
  private readonly logger = new Logger(AutoResponderPreviewService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private templateService: AutoResponderTemplateService,
    private queueStatsService: QueueStatsService,
    private qaService: AutoResponderQaService,
  ) {}

  /**
   * Determine priority level from thread's star count and urgency
   */
  determinePriorityLevel(
    thread: EmailThread | null,
  ): "low" | "medium" | "high" {
    // If no thread, default to medium priority
    if (!thread) {
      return "medium";
    }
    // High priority: 3 stars or high urgency score
    if (
      thread.starCount >= PRIORITY_THRESHOLDS.HIGH_PRIORITY_STARS ||
      thread.urgencyScore >= PRIORITY_THRESHOLDS.HIGH_URGENCY
    ) {
      return "high";
    }
    // Low priority: 1 star or low urgency
    if (
      thread.starCount === PRIORITY_THRESHOLDS.LOW_PRIORITY_STARS ||
      thread.urgencyScore < PRIORITY_THRESHOLDS.LOW_URGENCY
    ) {
      return "low";
    }
    // Medium priority: default
    return "medium";
  }

  /**
   * Preview auto-response with sample data
   */
  async previewAutoResponse(
    userId: string,
    templateType: "standard" | "highPriority" | "lowPriority" | "zeroBacklog",
    config: AutoResponderConfig,
  ): Promise<{ subject: string; body: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const queueStats = await this.queueStatsService.getQueueStats(userId);

    const sampleVars: AutoResponseTemplateVars = {
      userName: user?.name || "Your Name",
      senderName: "John Smith",
      originalSubject: "Question about your project",
      priorityLevel: getPriorityLevel(templateType),
      actionCount:
        queueStats.actionCount || PREVIEW_DEFAULTS.SAMPLE_ACTION_COUNT,
      triageCount:
        queueStats.triageCount || PREVIEW_DEFAULTS.SAMPLE_TRIAGE_COUNT,
      avgResponseTime: queueStats.avgResponseTime || "~4 days",
      urgentResponseTime: queueStats.urgentResponseTime || "12-24 hours",
      aiAnswer:
        "Based on previous conversations, the project timeline is approximately 3-4 weeks from kickoff to delivery.",
      hasAiAnswer: true,
    };

    const template = config.templates[templateType];
    const body = this.templateService.renderTemplate(template, sampleVars);

    return {
      subject: `Re: ${sampleVars.originalSubject} - BearlyMail Auto-Response`,
      body,
    };
  }

  /**
   * Preview auto-response for a specific email (shows what would actually be sent)
   */
  async previewAutoResponseForEmail(
    userId: string,
    emailId: string,
    config: AutoResponderConfig,
  ): Promise<{
    subject: string;
    body: string;
    templateUsed: string;
    priorityLevel: string;
    senderName: string;
    originalSubject: string;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const queueStats = await this.queueStatsService.getQueueStats(userId);

    // Get the email
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    // Get the thread to determine priority
    const thread = email.emailThreadId
      ? await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId },
        })
      : null;

    // Determine priority level from thread's star count and urgency
    const priorityLevel = this.determinePriorityLevel(thread);

    // Build template variables with real data
    const templateVars: AutoResponseTemplateVars = {
      userName: user?.name || "the recipient",
      senderName: email.fromName || email.from.split("@")[0],
      originalSubject: email.subject,
      priorityLevel,
      actionCount: queueStats.actionCount,
      triageCount: queueStats.triageCount,
      avgResponseTime: queueStats.avgResponseTime,
      urgentResponseTime: queueStats.urgentResponseTime,
      aiAnswer: null,
      hasAiAnswer: false,
    };

    // Generate Q&A answer if enabled
    if (config.qaContextEnabled) {
      const qaResult = await this.qaService.generateQAAnswer(
        userId,
        email.subject,
        email.body,
        config.qaMinConfidence,
      );
      if (qaResult && qaResult.confidence >= config.qaMinConfidence) {
        templateVars.aiAnswer = qaResult.answer;
        templateVars.hasAiAnswer = true;
      }
    }

    // Select the appropriate template
    const template = this.templateService.selectTemplate(
      config,
      priorityLevel,
      queueStats,
    );
    const templateUsed = this.templateService.getTemplateType(config, template);

    const body = this.templateService.renderTemplate(template, templateVars);

    return {
      subject: `Re: ${email.subject} - BearlyMail Auto-Response`,
      body,
      templateUsed,
      priorityLevel,
      senderName: templateVars.senderName,
      originalSubject: email.subject,
    };
  }

  /**
   * Get recent emails for preview selection
   * Only returns incoming emails (not sent by the user) that would be eligible for auto-response
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
    // Get user's email to filter out sent emails
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        email: true,
      },
    });

    if (!user) {
      return [];
    }

    const userEmail = user.email?.toLowerCase();

    // Fetch more emails than needed since we'll filter out sent emails
    const emails = await this.emailRepository.find({
      where: { userId },
      order: { receivedAt: "DESC" },
      take: limit * 3,
      select: {
        id: true,
        from: true,
        fromName: true,
        subject: true,
        receivedAt: true,
        emailThreadId: true,
      },
    });

    // Filter out emails sent by the user (only show incoming emails)
    const incomingEmails = emails.filter((email) => {
      const fromEmail = email.from?.toLowerCase();
      return fromEmail && fromEmail !== userEmail;
    });

    // Get thread priority scores for incoming emails only
    const emailsWithPriority = await Promise.all(
      incomingEmails.slice(0, limit).map(async (email) => {
        let priorityScore: number | null = null;
        if (email.emailThreadId) {
          const thread = await this.emailThreadRepository.findOne({
            where: { id: email.emailThreadId, userId },
            select: {
              priorityScore: true,
            },
          });
          priorityScore = thread?.priorityScore || null;
        }
        return {
          id: email.id,
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          receivedAt: email.receivedAt,
          priorityScore,
        };
      }),
    );

    return emailsWithPriority;
  }
}
