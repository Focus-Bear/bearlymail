import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Not, LessThan, MoreThan } from "typeorm";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { QueueStats } from "./types/auto-responder.types";
import { DAYS, HOURS, MILLISECONDS } from "../constants/time-constants";

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

      return {
        actionCount: this.formatCount(actionCount),
        triageCount: this.formatCount(triageCount),
        avgResponseTime,
        urgentResponseTime,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats for user ${userId}`, error);
      return {
        actionCount: 0,
        triageCount: 0,
        avgResponseTime: "~3-5 days",
        urgentResponseTime: "12-24 hours",
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
      // Get emails with timeToReply in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

      return "~3-5 days"; // Default fallback
    } catch (error) {
      this.logger.warn("Failed to calculate average response time", error);
      return "~3-5 days";
    }
  }

  /**
   * Calculate response time for high priority/urgent emails
   */
  private async calculateUrgentResponseTime(userId: string): Promise<string> {
    try {
      // Get starred (high priority) emails with timeToReply
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const urgentEmails = await this.emailRepository
        .createQueryBuilder("email")
        .innerJoin("email.thread", "thread")
        .select("AVG(email.timeToReply)", "avgReplyTime")
        .where("email.userId = :userId", { userId })
        .andWhere("email.timeToReply IS NOT NULL")
        .andWhere("email.timeToReply > 0")
        .andWhere("thread.starCount >= 2") // High priority
        .andWhere("email.receivedAt > :thirtyDaysAgo", { thirtyDaysAgo })
        .getRawOne();

      if (urgentEmails?.avgReplyTime) {
        const avgMinutes = parseFloat(urgentEmails.avgReplyTime);
        return this.formatResponseTime(avgMinutes);
      }

      return "12-24 hours"; // Default for urgent
    } catch (error) {
      this.logger.warn("Failed to calculate urgent response time", error);
      return "12-24 hours";
    }
  }

  /**
   * Format response time in human-readable format
   */
  private formatResponseTime(minutes: number): string {
    if (minutes < 60) {
      return `~${Math.round(minutes)} minutes`;
    }

    const hours = minutes / 60;
    if (hours < 24) {
      if (hours < 2) {
        return "~1 hour";
      }
      return `~${Math.round(hours)} hours`;
    }

    const days = hours / 24;
    if (days < 1.5) {
      return "~1 day";
    }
    if (days < 7) {
      return `~${Math.round(days)} days`;
    }

    const weeks = days / 7;
    if (weeks < 1.5) {
      return "~1 week";
    }
    return `~${Math.round(weeks)} weeks`;
  }

  /**
   * Get formatted display string for queue stats
   */
  formatStatsForDisplay(stats: QueueStats): string {
    const actionText =
      stats.actionCount > 100
        ? "100+ emails flagged for action"
        : `${stats.actionCount} emails flagged for action`;
    const triageText =
      stats.triageCount > 100
        ? "100+ emails still to triage"
        : `${stats.triageCount} emails still to triage`;

    return `📬 ${actionText}\n📋 ${triageText}\n⏱️ Average response time: ${stats.avgResponseTime}`;
  }
}
