import { Injectable } from "@nestjs/common";

import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderSuppressionService } from "./auto-responder-suppression.service";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { EmailClassification, QueueStats } from "./types/auto-responder.types";

/**
 * Groups email classification, queue stats, suppression, and Q&A services
 * to reduce constructor param count in AutoResponderService.
 */
@Injectable()
export class AutoResponderContextService {
  constructor(
    private readonly emailClassifierService: EmailClassifierService,
    private readonly queueStatsService: QueueStatsService,
    private readonly suppressionService: AutoResponderSuppressionService,
    private readonly qaService: AutoResponderQaService,
  ) {}

  classifyEmail(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      htmlBody?: string;
    },
    headers?: Record<string, string>,
    hasUserReplies?: boolean,
  ) {
    return this.emailClassifierService.classifyEmail(
      email,
      headers,
      hasUserReplies,
    );
  }

  checkCustomExclusionRules(
    email: { from: string; fromName?: string; subject: string; body: string },
    rules: string[],
    classification?: EmailClassification,
    headers?: Record<string, string>,
  ) {
    return this.emailClassifierService.checkCustomExclusionRules(
      email,
      rules,
      classification,
      headers,
    );
  }

  generateQAAnswer(
    userId: string,
    subject: string,
    body: string,
    minConfidence: number,
  ) {
    return this.qaService.generateQAAnswer(
      userId,
      subject,
      body,
      minConfidence,
    );
  }

  getQueueStats(userId: string): Promise<QueueStats> {
    return this.queueStatsService.getQueueStats(userId);
  }

  getResponseTimeForCategory(
    stats: QueueStats,
    category: string | null,
  ): string {
    return this.queueStatsService.getResponseTimeForCategory(stats, category);
  }

  hashEmail(email: string): string {
    return this.suppressionService.hashEmail(email);
  }

  checkSuppression(
    userId: string,
    emailHash: string,
  ): Promise<AutoResponseSuppression | null> {
    return this.suppressionService.checkSuppression(userId, emailHash);
  }

  addCooldownSuppression(
    userId: string,
    emailHash: string,
    cooldownDays: number,
  ): Promise<void> {
    return this.suppressionService.addCooldownSuppression(
      userId,
      emailHash,
      cooldownDays,
    );
  }

  addOptOutSuppression(
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

  removeOptOutSuppression(userId: string, senderEmail: string): Promise<void> {
    return this.suppressionService.removeOptOutSuppression(userId, senderEmail);
  }
}
