import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";

@Injectable()
export class EmailBacklogService {
  private readonly logger = new Logger(EmailBacklogService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(EmailThread)
    private readonly threadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  async queueBacklogProcessing(
    userId: string,
  ): Promise<{ threadCount: number }> {
    const BACKLOG_LIMIT = 200;

    const deferredThreads = await this.threadRepository.find({
      where: { userId, aiProcessingDeferred: true },
      select: {
        id: true,
      },
      order: { updatedAt: "DESC" },
      take: BACKLOG_LIMIT,
    });

    if (deferredThreads.length === 0) {
      return { threadCount: 0 };
    }

    const threadIds = deferredThreads.map((thread) => thread.id);

    await this.boss
      .send(
        JOB_NAMES.REFINE_PRIORITY_BATCH,
        { userId, threadIds, isBacklogProcessing: true },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BATCH, false),
          singletonKey: `backlog-priority-${userId}`,
        },
      )
      .catch((err) =>
        this.logger.error(
          `Failed to queue backlog priority batch for user ${userId}:`,
          err,
        ),
      );

    // Batch-fetch the latest email ID per thread in one query to avoid N+1.
    // Subquery finds the max receivedAt per thread; outer query returns the email id.
    const latestEmailRows = await this.emailRepository
      .createQueryBuilder("e")
      .select("e.id", "id")
      .addSelect("e.emailThreadId", "threadId")
      .where("e.emailThreadId IN (:...threadIds)", { threadIds })
      .andWhere(
        // Identifiers in this raw subquery must be double-quoted: Postgres folds
        // unquoted identifiers to lowercase, so `e2.receivedAt` would become
        // `e2.receivedat` (which doesn't exist) and throw at runtime.
        'e."receivedAt" = (SELECT MAX(e2."receivedAt") FROM emails e2 WHERE e2."emailThreadId" = e."emailThreadId")',
      )
      .getRawMany<{ id: string; threadId: string }>();

    const latestEmailByThread = new Map(
      latestEmailRows.map((row) => [row.threadId, row.id]),
    );

    const summaryJobs = threadIds
      .map((threadId) => {
        const emailId = latestEmailByThread.get(threadId);
        if (!emailId) return null;
        return this.boss
          .send(
            JOB_NAMES.GENERATE_SUMMARY,
            { userId, emailId, threadId, isBacklogProcessing: true },
            {
              priority: getJobPriority(
                JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
                false,
              ),
              singletonKey: `backlog-summary-${threadId}`,
            },
          )
          .catch((err) =>
            this.logger.error(
              `Failed to queue backlog summary for thread ${threadId}:`,
              err,
            ),
          );
      })
      .filter(Boolean);

    await Promise.all(summaryJobs);

    this.logger.log(
      `Queued backlog processing for user ${userId}: ${deferredThreads.length} deferred threads`,
    );

    return { threadCount: deferredThreads.length };
  }

  async getBacklogProgress(userId: string): Promise<{
    remaining: number;
    isProcessing: boolean;
  }> {
    const remaining = await this.threadRepository.count({
      where: { userId, aiProcessingDeferred: true },
    });

    return {
      remaining,
      isProcessing: remaining > 0,
    };
  }
}
