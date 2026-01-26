import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { QUERY_LIMITS } from "../constants/query-limits";
import { PRIORITY_SCORES } from "../constants/priority-constants";

@Injectable()
export class EmailStatusService {
  private readonly logger = new Logger(EmailStatusService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
  ) {}

  /**
   * Get sync status for a user
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSyncStatus(_userId: string): Promise<{
    lastSyncAt: Date | null;
    isSyncing: boolean;
  }> {
    // TODO: Add lastEmailSyncAt property to User entity
    // TODO: Track active sync jobs
    return {
      lastSyncAt: null,
      isSyncing: false,
    };
  }

  /**
   * Force check for new emails by unbatting all pending batched emails
   */
  async forceCheckNewEmails(
    userId: string,
    getInbox: (
      userId: string,
      includeBatched: boolean,
      mode: "triage" | "action" | "follow-up",
    ) => Promise<Email[]>,
  ): Promise<Email[]> {
    // Unbatch ALL pending batched emails for the user, effectively "delivering" them now
    await this.emailRepository.update(
      {
        userId,
        isBatched: true,
      },
      { isBatched: false },
    );

    // Return Triage inbox by default after force check
    return getInbox(userId, true, "triage");
  }

  /**
   * Get the next batch release time for a user
   */
  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    const nextBatch = await this.emailRepository.findOne({
      where: { userId, isBatched: true },
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
    // Get all batched emails that are marked as urgent AND have very high priority score
    // Require BOTH conditions to be more strict about what counts as urgent
    // Priority threshold raised to 90+ (was 80+) to reduce false positives
    // Join with email_threads to check isArchived and get priority (now thread-level)
    const urgentBatchedEmails = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .where("email.userId = :userId", { userId })
      .andWhere("thread.userId = :userId", { userId })
      .andWhere("email.isBatched = true")
      .andWhere("thread.isArchived = false")
      // Must have high urgency score (90+)
      .andWhere("thread.urgencyScore >= 90")
      // AND must have very high priority (90+) - calculated from thread priorityExplanation
      .andWhere(
        `COALESCE(
          (SELECT (jsonb_extract_path_text(thread."priorityExplanation"::jsonb, 'score')::int))
          , 0
        ) >= ${PRIORITY_SCORES.VERY_HIGH}`,
      )
      .select([
        "email.subject",
        "email.from",
        "email.fromName",
        "thread.urgencyScore",
      ])
      .limit(QUERY_LIMITS.MAX_RESULTS_DEFAULT)
      .getMany();

    const urgentEmails = urgentBatchedEmails.map((email) => {
      // Calculate priority score from thread (if available)
      // For now, use urgencyScore as a proxy
      const priorityScore = (email as any).urgencyScore || 0;

      return {
        subject: email.subject || "No subject",
        from: email.fromName || email.from || "Unknown",
        priorityScore,
      };
    });

    return {
      hasUrgent: urgentEmails.length > 0,
      urgentCount: urgentEmails.length,
      urgentEmails,
    };
  }
}
