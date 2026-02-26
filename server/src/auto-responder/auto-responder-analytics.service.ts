import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import {
  QASearchResult,
  EmailClassification,
  AutoResponseLogPriority,
} from "./types/auto-responder.types";

/**
 * Service for auto-response analytics and logging
 */
@Injectable()
export class AutoResponderAnalyticsService {
  private readonly logger = new Logger(AutoResponderAnalyticsService.name);

  constructor(
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
  ) {}

  /**
   * Log an auto-response
   */
  async logAutoResponse(params: {
    userId: string;
    emailThreadId: string;
    senderEmailHash: string;
    priorityLevel: "low" | "medium" | "high";
    qaResult: QASearchResult | null;
    templateUsed: string;
    responseSubject: string;
    responseBody: string;
    classification: EmailClassification;
  }): Promise<void> {
    const {
      userId,
      emailThreadId,
      senderEmailHash,
      priorityLevel,
      qaResult,
      templateUsed,
      responseSubject,
      responseBody,
      classification,
    } = params;
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
   * Check if auto-response was already sent to this thread
   */
  async hasExistingResponse(
    userId: string,
    emailThreadId: string,
  ): Promise<AutoResponseLog | null> {
    return this.autoResponseLogRepository.findOne({
      where: { userId, emailThreadId },
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
      low: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.LOW,
      ).length,
      medium: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.MEDIUM,
      ).length,
      high: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.HIGH,
      ).length,
    };
    const qaAnswerCount = logs.filter((log) => log.qaAnswerProvided).length;
    const escalationCount = logs.filter(
      (log) => log.escalationRequested,
    ).length;

    const templateBreakdown: Record<string, number> = {};
    for (const log of logs) {
      templateBreakdown[log.templateUsed] =
        (templateBreakdown[log.templateUsed] || 0) + 1;
    }

    return {
      totalSent,
      byPriority,
      qaAnswerRate: totalSent > 0 ? qaAnswerCount / totalSent : 0,
      escalationRate: totalSent > 0 ? escalationCount / totalSent : 0,
      templateBreakdown,
    };
  }
}
