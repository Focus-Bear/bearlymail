/**
 * Debounces per-user refine-priority jobs: emails arriving within a short
 * window are flushed to PgBoss as ONE batch job instead of N single jobs.
 *
 * Extracted from EmailLifecycleService (which mixed this with persistence and
 * batch-delivery concerns) and hardened against the failure mode the buffer
 * used to have: the pending email ids lived only in process memory, so a
 * worker respawn or ECS deploy inside the 5s window silently dropped them and
 * those threads sat on "Calculating…" until something else re-queued them.
 * `onModuleDestroy` now drains every user's buffer to PgBoss before shutdown.
 */
import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MS_PER_SECOND, SECONDS } from "../constants/time-constants";
import { getJobPriority } from "../queue/job-priorities";

interface UserBatchBuffer {
  emailIds: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class PriorityBatchSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(PriorityBatchSchedulerService.name);

  private readonly priorityBatchBuffer = new Map<string, UserBatchBuffer>();

  private readonly BATCH_FLUSH_DELAY_MS = 5 * MS_PER_SECOND;

  private readonly BATCH_MAX_SIZE = 10;

  constructor(@Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss) {}

  /**
   * Drain every buffered email to PgBoss before the process exits, so a
   * deploy/respawn inside the debounce window cannot lose refinements.
   */
  async onModuleDestroy(): Promise<void> {
    const userIds = [...this.priorityBatchBuffer.keys()];
    if (userIds.length === 0) return;
    this.logger.log(
      `Draining priority batch buffer for ${userIds.length} user(s) before shutdown`,
    );
    await Promise.all(
      userIds.map((userId) =>
        this.flushPriorityBatch(userId).catch((err) =>
          this.logger.error(
            `Failed to drain priority batch for user ${userId} on shutdown:`,
            err,
          ),
        ),
      ),
    );
  }

  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    let buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer) {
      buffer = { emailIds: [], timer: null };
      this.priorityBatchBuffer.set(userId, buffer);
    }
    buffer.emailIds.push(emailId);

    if (buffer.emailIds.length >= this.BATCH_MAX_SIZE) {
      await this.flushPriorityBatch(userId);
      return;
    }

    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = setTimeout(() => {
      this.flushPriorityBatch(userId).catch((err) =>
        this.logger.error(
          `Failed to flush priority batch for user ${userId}:`,
          err,
        ),
      );
    }, this.BATCH_FLUSH_DELAY_MS);
  }

  private async flushPriorityBatch(userId: string): Promise<void> {
    const buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer || buffer.emailIds.length === 0) return;
    const emailIds = [...buffer.emailIds];
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
    // Remove the entry entirely — keeping drained `{[], null}` objects around
    // would grow the Map by one entry per user for the process lifetime.
    this.priorityBatchBuffer.delete(userId);

    if (emailIds.length === 1) {
      await this.boss
        .send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: emailIds[0] },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-${emailIds[0]}`,
            singletonSeconds: SECONDS.MINUTE,
          },
        )
        .catch((err) =>
          this.logger.error(
            `Failed to queue single priority refinement for email ${emailIds[0]}:`,
            err,
          ),
        );
      return;
    }

    const batchJobId = await this.boss
      .send(
        JOB_NAMES.REFINE_PRIORITY_BATCH,
        { userId, emailIds },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BATCH, false),
          singletonKey: `refine-priority-batch-${userId}-${Date.now()}`,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue batch priority refinement for ${emailIds.length} emails:`,
          err,
        );
        return null;
      });

    if (batchJobId)
      this.logger.log(
        `Queued batch priority refinement job ${batchJobId} for ${emailIds.length} emails (user: ${userId})`,
      );
  }
}
