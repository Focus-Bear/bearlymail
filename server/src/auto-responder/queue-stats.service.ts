import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { RATIOS } from "../constants/percentages";
import { LEARNING_THRESHOLDS } from "../constants/service-constants";
import {
  DAYS,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
} from "../constants/time-constants";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { decryptContextValue } from "../encryption/encryption.helper";
import { DISPLAY_LIMITS, STATS_CONFIG } from "./auto-responder-constants";
import { CategoryReplyTime, QueueStats } from "./types/auto-responder.types";

// Default response times when no data is available (calculated from typical patterns)
const DEFAULT_RESPONSE_TIMES = {
  // Default when no reply data exists at all
  NO_DATA: "a few days",
  // Default for urgent emails when no data
  URGENT_NO_DATA: "12-24 hours",
} as const;

@Injectable()
export class QueueStatsService {
  private readonly logger = new Logger(QueueStatsService.name);

  constructor(
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
  ) {}

  /**
   * Calculate current queue statistics for a user
   */
  async getQueueStats(userId: string): Promise<QueueStats> {
    try {
      // Count emails flagged for action (starred, not archived)
      const actionCount = await this.emailThreadRepository.count({
        where: {
          userId,
          starCount: MoreThan(0),
          isArchived: false,
        },
      });

      // Count emails pending triage (not starred, not archived)
      const triageCount = await this.emailThreadRepository.count({
        where: {
          userId,
          starCount: 0,
          isArchived: false,
        },
      });

      // Calculate average response time from recent emails
      const avgResponseTime = await this.calculateAverageResponseTime(userId);
      const urgentResponseTime = await this.calculateUrgentResponseTime(userId);

      // Get category-specific reply times for more accurate auto-response messaging
      const categoryReplyTimes = await this.calculateCategoryReplyTimes(userId);

      return {
        actionCount: this.formatCount(actionCount),
        triageCount: this.formatCount(triageCount),
        avgResponseTime,
        urgentResponseTime,
        categoryReplyTimes,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats for user ${userId}`, error);
      return {
        actionCount: 0,
        triageCount: 0,
        avgResponseTime: DEFAULT_RESPONSE_TIMES.NO_DATA,
        urgentResponseTime: DEFAULT_RESPONSE_TIMES.URGENT_NO_DATA,
      };
    }
  }

  /**
   * Format count for display (cap at 100+)
   */
  private formatCount(count: number): number {
    // Return actual count, the template can format as needed
    return count;
  }

  /**
   * Calculate average response time for medium priority emails
   */
  private async calculateAverageResponseTime(userId: string): Promise<string> {
    try {
      // Get emails with timeToReply in the last N days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(
        thirtyDaysAgo.getDate() - STATS_CONFIG.LOOKBACK_DAYS,
      );

      const emailsWithReply = await this.emailRepository
        .createQueryBuilder("email")
        .select("AVG(email.timeToReply)", "avgReplyTime")
        .where("email.userId = :userId", { userId })
        .andWhere("email.timeToReply IS NOT NULL")
        .andWhere("email.timeToReply > 0")
        .andWhere("email.receivedAt > :thirtyDaysAgo", { thirtyDaysAgo })
        .getRawOne();

      if (emailsWithReply?.avgReplyTime) {
        const avgMinutes = parseFloat(emailsWithReply.avgReplyTime);
        return this.formatResponseTime(avgMinutes);
      }

      return DEFAULT_RESPONSE_TIMES.NO_DATA;
    } catch (error) {
      this.logger.warn("Failed to calculate average response time", error);
      return DEFAULT_RESPONSE_TIMES.NO_DATA;
    }
  }

  /**
   * Calculate response time for high priority/urgent emails
   */
  private async calculateUrgentResponseTime(userId: string): Promise<string> {
    try {
      // Get starred (high priority) emails with timeToReply
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(
        thirtyDaysAgo.getDate() - STATS_CONFIG.LOOKBACK_DAYS,
      );

      const urgentEmails = await this.emailRepository
        .createQueryBuilder("email")
        .innerJoin("email.thread", "thread")
        .select("AVG(email.timeToReply)", "avgReplyTime")
        .where("email.userId = :userId", { userId })
        .andWhere("email.timeToReply IS NOT NULL")
        .andWhere("email.timeToReply > 0")
        // High priority
        .andWhere("thread.starCount >= 2")
        .andWhere("email.receivedAt > :thirtyDaysAgo", { thirtyDaysAgo })
        .getRawOne();

      if (urgentEmails?.avgReplyTime) {
        const avgMinutes = parseFloat(urgentEmails.avgReplyTime);
        return this.formatResponseTime(avgMinutes);
      }

      return DEFAULT_RESPONSE_TIMES.URGENT_NO_DATA;
    } catch (error) {
      this.logger.warn("Failed to calculate urgent response time", error);
      return DEFAULT_RESPONSE_TIMES.URGENT_NO_DATA;
    }
  }

  /**
   * Calculate reply times broken down by email category
   * Used for more accurate auto-response messaging based on the email's category
   */
  private async calculateCategoryReplyTimes(
    userId: string,
  ): Promise<CategoryReplyTime[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(
        thirtyDaysAgo.getDate() - STATS_CONFIG.LOOKBACK_DAYS,
      );

      // JOIN user_contexts for category name — denorm column removed (fixes #1293).
      const categoryStats = await this.emailRepository
        .createQueryBuilder("email")
        .innerJoin("email.thread", "thread")
        .leftJoin("user_contexts", "uc", 'uc."contextId" = thread."categoryId"')
        .select('uc."contextValue"', "category")
        .addSelect('thread."categoryId"', "categoryId")
        .addSelect("AVG(email.timeToReply)", "avgReplyTimeMinutes")
        .addSelect("COUNT(email.id)", "repliedCount")
        .where("email.userId = :userId", { userId })
        .andWhere("email.timeToReply IS NOT NULL")
        .andWhere("email.timeToReply > 0")
        .andWhere("email.receivedAt > :thirtyDaysAgo", { thirtyDaysAgo })
        .groupBy('thread."categoryId"')
        .addGroupBy('uc."contextValue"')
        .getRawMany();

      // Decrypt before extracting the display name — raw queries bypass TypeORM transformers.
      return categoryStats.map((stat) => ({
        category: decryptContextValue(stat.category) ?? "Other",
        avgReplyTimeMinutes: parseFloat(stat.avgReplyTimeMinutes),
        repliedCount: parseInt(stat.repliedCount, 10),
      }));
    } catch (error) {
      this.logger.warn("Failed to calculate category reply times", error);
      return [];
    }
  }

  /**
   * Get formatted response time for a specific category
   * Falls back to overall average if category-specific data is not available
   */
  getResponseTimeForCategory(
    stats: QueueStats,
    category: string | null,
  ): string {
    if (!category || !stats.categoryReplyTimes?.length) {
      return stats.avgResponseTime;
    }

    const categoryData = stats.categoryReplyTimes.find(
      (categoryEntry) =>
        categoryEntry.category.toLowerCase() === category.toLowerCase(),
    );

    if (
      categoryData &&
      categoryData.repliedCount >= LEARNING_THRESHOLDS.MIN_CATEGORY_DATA_POINTS
    ) {
      // Only use category-specific time if we have at least MIN_CATEGORY_DATA_POINTS data points
      return this.formatResponseTime(categoryData.avgReplyTimeMinutes);
    }

    return stats.avgResponseTime;
  }

  /**
   * Format response time in human-readable format
   */
  private formatResponseTime(minutes: number): string {
    if (minutes < MINUTES_PER_HOUR) {
      return `~${Math.round(minutes)} minutes`;
    }

    const hours = minutes / MINUTES_PER_HOUR;
    if (hours < HOURS_PER_DAY) {
      if (hours < 2) {
        return "~1 hour";
      }
      return `~${Math.round(hours)} hours`;
    }

    const days = hours / HOURS_PER_DAY;
    if (days < RATIOS.ONE_POINT_FIVE) {
      return "~1 day";
    }
    if (days < DAYS.WEEK) {
      return `~${Math.round(days)} days`;
    }

    const weeks = days / DAYS.WEEK;
    if (weeks < RATIOS.ONE_POINT_FIVE) {
      return "~1 week";
    }
    return `~${Math.round(weeks)} weeks`;
  }

  /**
   * Get formatted display string for queue stats
   */
  formatStatsForDisplay(stats: QueueStats): string {
    const actionText =
      stats.actionCount > DISPLAY_LIMITS.MAX_DISPLAY_COUNT
        ? `${DISPLAY_LIMITS.MAX_DISPLAY_COUNT}+ emails flagged for action`
        : `${stats.actionCount} emails flagged for action`;
    const triageText =
      stats.triageCount > DISPLAY_LIMITS.MAX_DISPLAY_COUNT
        ? `${DISPLAY_LIMITS.MAX_DISPLAY_COUNT}+ emails still to triage`
        : `${stats.triageCount} emails still to triage`;

    return `📬 ${actionText}\n📋 ${triageText}\n⏱️ Average response time: ${stats.avgResponseTime}`;
  }
}
