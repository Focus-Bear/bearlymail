import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { getJobPriority } from "../queue/job-priorities";
import { formatGaxiosError } from "../types/common";

export interface ReadStatusSyncJobData {
  userId: string;
  emailId: string;
}

/**
 * Queues mirroring of a USER's read/unread action to their email provider.
 *
 * Only user-initiated paths (the read/unread endpoints) may call this. Provider
 * sync, archive and AI triage write `isRead` directly instead: a sync that
 * learns read state from Gmail and queued this would echo it straight back.
 */
@Injectable()
export class ReadStatusSyncService {
  private readonly logger = new Logger(ReadStatusSyncService.name);

  constructor(@Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss) {}

  /**
   * Fire-and-forget: the user's request must never wait on, or fail because
   * of, the provider. The job reads the email's read state when it runs, so a
   * quick read-then-unread still lands on the final state whatever the order.
   */
  queueProviderSync(userId: string, emailIds: string[]): void {
    for (const emailId of new Set(emailIds)) {
      this.queueOne({ userId, emailId });
    }
  }

  private queueOne(jobData: ReadStatusSyncJobData): void {
    this.boss
      .send(JOB_NAMES.READ_STATUS_PROVIDER_SYNC, jobData, {
        priority: getJobPriority(JOB_NAMES.READ_STATUS_PROVIDER_SYNC, true),
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `[Read Sync] Failed to queue provider sync: userId=${jobData.userId}, emailId=${jobData.emailId}: ${formatGaxiosError(error)}`,
        ),
      );
  }
}
