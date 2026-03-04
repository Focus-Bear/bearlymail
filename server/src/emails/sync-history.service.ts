import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SyncHistoryLog } from "../database/entities/sync-history-log.entity";

export interface SyncAttemptData {
  userId: string;
  provider: string;
  syncWindowStart: Date | null;
  queries: string[];
  threadsFound: number;
  durationMs: number;
  errorMessage?: string;
  isContinuation?: boolean;
}

export interface SyncHistoryEntry {
  id: string;
  syncedAt: Date;
  completedAt: Date | null;
  provider: string;
  syncWindowStart: Date | null;
  queries: string[];
  threadsFound: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  isContinuation: boolean;
}

const MAX_HISTORY_PER_USER = 50;

@Injectable()
export class SyncHistoryService {
  private readonly logger = new Logger(SyncHistoryService.name);

  constructor(
    @InjectRepository(SyncHistoryLog)
    private syncHistoryLogRepository: Repository<SyncHistoryLog>,
  ) {}

  /**
   * Log a completed sync attempt.
   */
  async logSyncAttempt(attempt: SyncAttemptData): Promise<void> {
    try {
      const log = this.syncHistoryLogRepository.create({
        userId: attempt.userId,
        provider: attempt.provider,
        syncWindowStart: attempt.syncWindowStart,
        queries: attempt.queries,
        threadsFound: attempt.threadsFound,
        durationMs: attempt.durationMs,
        errorMessage: attempt.errorMessage ?? null,
        isContinuation: attempt.isContinuation ?? false,
        completedAt: new Date(),
      });

      await this.syncHistoryLogRepository.save(log);

      // Prune old entries so the table doesn't grow unbounded
      await this.pruneOldEntries(attempt.userId);
    } catch (error) {
      // Non-critical - don't let logging failures break sync
      this.logger.error("Failed to log sync attempt:", error);
    }
  }

  /**
   * Retrieve recent sync history for a user.
   */
  async getSyncHistory(
    userId: string,
    limit = 20,
  ): Promise<SyncHistoryEntry[]> {
    const logs = await this.syncHistoryLogRepository.find({
      where: { userId },
      order: { syncedAt: "DESC" },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      syncedAt: log.syncedAt,
      completedAt: log.completedAt,
      provider: log.provider,
      syncWindowStart: log.syncWindowStart,
      queries: log.queries ?? [],
      threadsFound: log.threadsFound,
      durationMs: log.durationMs,
      errorMessage: log.errorMessage,
      isContinuation: log.isContinuation,
    }));
  }

  private async pruneOldEntries(userId: string): Promise<void> {
    // Keep only the most recent MAX_HISTORY_PER_USER entries
    await this.syncHistoryLogRepository.query(
      `
      DELETE FROM sync_history_logs
      WHERE "userId" = $1
        AND id NOT IN (
          SELECT id FROM sync_history_logs
          WHERE "userId" = $1
          ORDER BY "syncedAt" DESC
          LIMIT $2
        )
      `,
      [userId, MAX_HISTORY_PER_USER],
    );
  }
}
