import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { buildDeterministicSummary } from "../llm/email-content-cleaner";
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
 * - Deterministic-rule path (and the authoritative local-model path): priority
 *   is known WITHOUT an LLM/summary, so we can gate on the score —
 *   `maybeQueueBackgroundSummary`. A background LLM summary is a cost we only
 *   spend on threads the user is likely to act on (score above the threshold).
 *   Lower-priority threads instead get a cheap, deterministic summary built
 *   from the email text (see {@link buildDeterministicSummary}), so the inbox
 *   shows a preview instead of a blank "Click to view email" placeholder and
 *   no LLM is spent on mail the user is unlikely to open.
 */
@Injectable()
export class BackgroundSummaryQueueService {
  private readonly logger = new Logger(BackgroundSummaryQueueService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly userEncryptionService: UserEncryptionService,
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
      // The LLM summary job never queued, so nothing will fill the summary —
      // fall back to a deterministic one rather than leaving the inbox blank.
      await this.writeDeterministicSummary(userId, emailId);
    }
  }

  /**
   * Enqueues a background LLM summary for all emails (since summaries are cheap with
   * Nova Micro). We keep the priorityScore argument in the signature to avoid breaking
   * existing callers and mock files.
   */
  async maybeQueueBackgroundSummary(args: {
    userId: string;
    emailId: string;
    threadId: string | null | undefined;
    priorityScore: number | null | undefined;
  }): Promise<void> {
    const { userId, emailId, threadId } = args;
    await this.queueBackgroundSummary({ userId, emailId, threadId });
  }

  /**
   * Writes a deterministic, non-LLM summary built from the email's text and
   * clears `isProcessingSummary`. If the email has no usable text, the summary
   * is left untouched (still null) and only the processing flag is cleared.
   *
   * body/htmlBody/summary are encrypted columns, so the read+write run inside
   * `withUserKey` — the transformer needs the per-user KMS key in
   * AsyncLocalStorage; without it findOne would return ciphertext and the
   * summary would be written under the wrong key. We establish it here rather
   * than relying on the caller's context.
   */
  private async writeDeterministicSummary(
    userId: string,
    emailId: string,
  ): Promise<void> {
    try {
      await this.userEncryptionService.withUserKey(userId, async () => {
        const email = await this.emailRepository.findOne({
          where: { id: emailId },
          select: { id: true, body: true, htmlBody: true },
        });
        const summary = email
          ? buildDeterministicSummary(email.body, email.htmlBody)
          : "";
        await this.emailRepository.update(
          { id: emailId },
          summary
            ? {
                summary,
                summarySource: "deterministic" as const,
                isProcessingSummary: false,
              }
            : { isProcessingSummary: false },
        );
      });
    } catch (err) {
      this.logger.error(
        `Failed to write deterministic summary for email ${emailId}:`,
        err,
      );
      await this.clearProcessingFlag(emailId);
    }
  }

  private async clearProcessingFlag(emailId: string): Promise<void> {
    await this.emailRepository
      .update({ id: emailId }, { isProcessingSummary: false })
      .catch(() => undefined);
  }
}
