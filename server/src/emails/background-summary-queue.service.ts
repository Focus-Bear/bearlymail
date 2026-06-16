import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { getJobPriority } from "../queue/job-priorities";

/**
 * Enqueues automated background summaries, replacing the eager enqueue that used
 * to fire at email-save time. The summary is now enqueued from a priority-
 * completion path, so the decision can depend on HOW priority was determined:
 *
 * - LLM path (the default when no deterministic rule or ML model classifies the
 *   thread): we ALWAYS summarise — `queueBackgroundSummary`. The downstream
 *   pipeline (category, sentiment, action items, meeting detection) and the LLM
 *   prioritisation prompt itself depend on the summary, so it must run.
 * - Deterministic-rule path (and, in future, an authoritative ML-model path):
 *   priority is known WITHOUT an LLM/summary, so we can gate on the score —
 *   `maybeQueueBackgroundSummary`. A background summary is an LLM cost we only
 *   spend on threads the user is likely to act on (score above the threshold);
 *   lower-priority threads summarise lazily, on demand, when the user opens the
 *   email (the email-detail view auto-triggers `/summarize` whenever an opened
 *   email has no summary and is not already processing one).
 */
@Injectable()
export class BackgroundSummaryQueueService {
  private readonly logger = new Logger(BackgroundSummaryQueueService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  /**
   * Unconditionally enqueues a background summary. Used by the LLM priority path,
   * where the summary is required regardless of the resulting score.
   */
  async queueBackgroundSummary(args: {
    userId: string;
    emailId: string;
    threadId: string | null | undefined;
  }): Promise<void> {
    const { userId, emailId, threadId } = args;
    try {
      const jobId = await this.boss.send(
        JOB_NAMES.GENERATE_SUMMARY,
        { userId, emailId, threadId },
        {
          priority: getJobPriority(
            JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
            false,
          ),
          // Do not singleton by thread: a follow-up arriving within the previous
          // 5-minute window must still enqueue a fresh summary job.
          singletonKey: `generate-summary-email-${emailId}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      );
      if (jobId) {
        this.logger.debug(
          `Queued background summary job ${jobId} for email ${emailId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to queue background summary for email ${emailId}:`,
        err,
      );
      await this.clearProcessingFlag(emailId);
    }
  }

  /**
   * Enqueues a background summary only when `priorityScore` is above
   * `PRIORITY_SCORES.BACKGROUND_SUMMARY_MIN`. Otherwise it clears the email's
   * `isProcessingSummary` flag so the UI stops showing a pending state and the
   * on-demand summary path takes over when the user opens the email. Used only
   * where priority was determined WITHOUT the LLM (deterministic/ML paths).
   */
  async maybeQueueBackgroundSummary(args: {
    userId: string;
    emailId: string;
    threadId: string | null | undefined;
    priorityScore: number | null | undefined;
  }): Promise<void> {
    const { userId, emailId, threadId, priorityScore } = args;

    if (
      priorityScore == null ||
      Number.isNaN(priorityScore) ||
      priorityScore <= PRIORITY_SCORES.BACKGROUND_SUMMARY_MIN
    ) {
      await this.clearProcessingFlag(emailId);
      this.logger.debug(
        `Skipping background summary for email ${emailId} (priorityScore=${priorityScore ?? "null"} <= ${PRIORITY_SCORES.BACKGROUND_SUMMARY_MIN}); will summarise on demand`,
      );
      return;
    }

    await this.queueBackgroundSummary({ userId, emailId, threadId });
  }

  private async clearProcessingFlag(emailId: string): Promise<void> {
    await this.emailRepository
      .update({ id: emailId }, { isProcessingSummary: false })
      .catch(() => undefined);
  }
}
