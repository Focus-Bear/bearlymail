import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UsersService } from "../users/users.service";

@Injectable()
export class EmailStatusService {
  private readonly logger = new Logger(EmailStatusService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private usersService: UsersService,
  ) {}

  /**
   * Get sync status for a user
   */
  async getSyncStatus(userId: string): Promise<{
    lastSyncAt: Date | null;
    isSyncing: boolean;
  }> {
    const user = await this.usersService.findOneLightweight(userId);
    return {
      lastSyncAt: user?.lastEmailSyncAt ?? null,
      isSyncing: false,
    };
  }

  /**
   * Force check for new emails by releasing all pending batched threads
   */
  async forceCheckNewEmails(
    userId: string,
    getInbox: (
      userId: string,
      includeBatched: boolean,
      mode: "triage" | "action" | "follow-up",
    ) => Promise<{ emails: Email[]; total: number; hasMore: boolean }>,
  ): Promise<Email[]> {
    await this.emailThreadRepository.update(
      {
        userId,
        isBatched: true,
      },
      { isBatched: false, batchDecisionReason: "Force-checked by user" },
    );

    // Return Triage inbox by default after force check
    const result = await getInbox(userId, true, "triage");
    return result.emails;
  }

  /**
   * Get the next batch release time for a user.
   * Only returns FUTURE dates — past-due batched threads are effectively already visible.
   */
  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    const now = new Date();
    const nextBatch = await this.emailThreadRepository.findOne({
      where: { userId, isBatched: true, batchReleaseAt: MoreThan(now) },
      order: { batchReleaseAt: "ASC" },
      select: ["batchReleaseAt"],
    });
    return nextBatch?.batchReleaseAt || null;
  }

  /**
   * Check for urgent emails that are currently batched
   */
  async checkForUrgentEmails(userId: string): Promise<{
    hasUrgent: boolean;
    urgentCount: number;
    urgentEmails: Array<{
      subject: string;
      from: string;
      priorityScore: number;
    }>;
  }> {
    // Get all batched threads that are marked as urgent AND have very high priority score.
    // Batch state is now thread-level (thread.isBatched). Query threads directly,
    // then fetch the latest email subject/from for display.
    const urgentBatchedThreads = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isBatched = true")
      .andWhere("thread.isArchived = false")
      // Must have high urgency score (90+)
      .andWhere("thread.urgencyScore >= 90")
      // AND must have very high priority (95+)
      .andWhere("COALESCE(thread.priorityScore, 0) >= :veryHighPriority", {
        veryHighPriority: PRIORITY_SCORES.VERY_HIGH,
      })
      .select(["thread.id", "thread.urgencyScore", "thread.priorityScore"])
      .limit(QUERY_LIMITS.MAX_RESULTS_DEFAULT)
      .getMany();

    // Fetch latest email for subject/from display
    const urgentEmails = await Promise.all(
      urgentBatchedThreads.map(async (thread) => {
        const latestEmail = await this.emailRepository.findOne({
          where: { emailThreadId: thread.id, userId },
          order: { receivedAt: "DESC" },
          select: ["subject", "from", "fromName"],
        });
        return {
          subject: latestEmail?.subject || "No subject",
          from: latestEmail?.fromName || latestEmail?.from || "Unknown",
          priorityScore: thread.priorityScore ?? 0,
        };
      }),
    );

    return {
      hasUrgent: urgentEmails.length > 0,
      urgentCount: urgentEmails.length,
      urgentEmails,
    };
  }
}
