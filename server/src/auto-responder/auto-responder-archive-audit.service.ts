import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { EmailThread } from "../database/entities/email-thread.entity";

export interface AuditedThread {
  threadId: string;
  emailThreadId: string;
  autoRespondedAt: Date;
  lastUserOperationAt: Date | null;
  recovered: boolean;
}

export interface ArchiveAuditResult {
  affectedCount: number;
  recoveredThreads: AuditedThread[];
  dryRun: boolean;
}

/**
 * Audit and recover email threads that were silently archived after an auto-response
 * was sent (Issue #857).
 *
 * Root cause: When BearlyMail sends an auto-reply, Gmail removes the INBOX label from
 * the thread. The BearlyMail sync job then picks up isArchived=true from Gmail and
 * overwrites the DB — causing the thread to disappear from Triage/Action views.
 *
 * This service finds all threads that:
 *   - Were auto-responded to (have an entry in auto_response_logs)
 *   - Are currently archived in BearlyMail (isArchived = true)
 *   - Have no explicit user archive action (lastUserOperationAt is null or older than the auto-response)
 *
 * And restores them to isArchived=false so the user can see them again.
 */
@Injectable()
export class AutoResponderArchiveAuditService {
  private readonly logger = new Logger(AutoResponderArchiveAuditService.name);

  constructor(
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
  ) {}

  /**
   * Find and optionally recover threads silently archived after auto-response.
   *
   * @param userId - The user to audit (required for multi-tenant safety)
   * @param dryRun - If true, only report affected threads without modifying the DB
   */
  async auditArchivedAutoRespondedThreads(
    userId: string,
    dryRun = false,
  ): Promise<ArchiveAuditResult> {
    this.logger.log(
      `Starting archive audit for user ${userId} (dryRun=${dryRun})`,
    );

    // Find all auto-response logs for this user
    const autoResponseLogs = await this.autoResponseLogRepository.find({
      where: { userId },
      order: { sentAt: "DESC" as const },
    });

    if (autoResponseLogs.length === 0) {
      this.logger.log(`No auto-response logs found for user ${userId}`);
      return { affectedCount: 0, recoveredThreads: [], dryRun };
    }

    const emailThreadIds = autoResponseLogs.map((log) => log.emailThreadId);

    // Find archived threads that have auto-response logs
    const archivedAutoRespondedThreads = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.id IN (:...emailThreadIds)", { emailThreadIds })
      .andWhere("thread.isArchived = true")
      .getMany();

    if (archivedAutoRespondedThreads.length === 0) {
      this.logger.log(
        `No silently-archived auto-responded threads found for user ${userId}`,
      );
      return { affectedCount: 0, recoveredThreads: [], dryRun };
    }

    // Build a lookup of emailThreadId -> latest auto-response log
    const logByThreadId = this.buildLogByThreadIdMap(autoResponseLogs);

    // Classify each archived thread: should it be recovered or was it user-archived?
    const { threadsToRecover, auditedResults } = this.classifyArchivedThreads(
      archivedAutoRespondedThreads,
      logByThreadId,
    );

    this.logger.log(
      `Audit found ${archivedAutoRespondedThreads.length} archived threads; ` +
        `${threadsToRecover.length} eligible for recovery (${archivedAutoRespondedThreads.length - threadsToRecover.length} skipped — user explicitly archived)`,
    );

    if (!dryRun && threadsToRecover.length > 0) {
      await this.recoverThreads(userId, threadsToRecover);
    }

    return {
      affectedCount: threadsToRecover.length,
      recoveredThreads: auditedResults,
      dryRun,
    };
  }

  /** Build a lookup map of emailThreadId → latest AutoResponseLog. */
  private buildLogByThreadIdMap(
    logs: AutoResponseLog[],
  ): Map<string, AutoResponseLog> {
    const logByThreadId = new Map<string, AutoResponseLog>();
    for (const log of logs) {
      if (!logByThreadId.has(log.emailThreadId)) {
        logByThreadId.set(log.emailThreadId, log);
      }
    }
    return logByThreadId;
  }

  /**
   * Classify each archived thread as either eligible for recovery (silently archived by Gmail
   * after auto-response) or intentionally archived by the user.
   */
  private classifyArchivedThreads(
    archivedThreads: EmailThread[],
    logByThreadId: Map<string, AutoResponseLog>,
  ): { threadsToRecover: EmailThread[]; auditedResults: AuditedThread[] } {
    const threadsToRecover: EmailThread[] = [];
    const auditedResults: AuditedThread[] = [];

    for (const thread of archivedThreads) {
      const autoResponseLog = logByThreadId.get(thread.id);
      if (!autoResponseLog) continue;

      const autoRespondedAt = autoResponseLog.sentAt as Date;
      const lastUserOp = thread.lastUserOperationAt;

      // If the user manually archived AFTER the auto-response, respect that.
      // Otherwise, treat this as a silent archive caused by Gmail sync — recover it.
      const userExplicitlyArchived =
        lastUserOp !== null &&
        new Date(lastUserOp).getTime() > new Date(autoRespondedAt).getTime();

      auditedResults.push({
        threadId: thread.threadId,
        emailThreadId: thread.id,
        autoRespondedAt: new Date(autoRespondedAt),
        lastUserOperationAt: lastUserOp,
        recovered: !userExplicitlyArchived,
      });

      if (!userExplicitlyArchived) {
        threadsToRecover.push(thread);
      }
    }

    return { threadsToRecover, auditedResults };
  }

  /** Unarchive a set of threads and log the operation. */
  private async recoverThreads(
    userId: string,
    threads: EmailThread[],
  ): Promise<void> {
    const idsToRecover = threads.map((thread) => thread.id);
    await this.emailThreadRepository
      .createQueryBuilder()
      .update()
      .set({
        isArchived: false,
        // Set lastUserOperationAt to now so sync won't re-archive before next email arrives
        lastUserOperationAt: new Date(),
      })
      .where("id IN (:...ids)", { ids: idsToRecover })
      .execute();

    this.logger.log(
      `Recovered ${threads.length} threads for user ${userId}: ${threads
        .map((thread) => thread.threadId)
        .join(", ")}`,
    );
  }
}
