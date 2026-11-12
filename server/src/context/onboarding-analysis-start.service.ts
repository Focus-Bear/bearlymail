import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  CONTEXT_ANALYSIS_STATUS,
  type ContextAnalysisStatus,
} from "../constants/domain-statuses";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";

/** Namespaces the per-user advisory lock so it can't collide with other `hashtext` locks. */
const START_LOCK_NAMESPACE = "onboarding-analysis-start";

/** A run in one of these states is worth joining rather than superseding. */
const JOINABLE_STATUSES: readonly ContextAnalysisStatus[] = [
  CONTEXT_ANALYSIS_STATUS.RUNNING,
  CONTEXT_ANALYSIS_STATUS.PENDING,
  CONTEXT_ANALYSIS_STATUS.COMPLETED,
];

/**
 * Starts the onboarding context analysis as soon as a new user's mailbox is
 * connected, so it has usually finished by the time the setup wizard reaches
 * its learning step, and lets that step join the run instead of starting
 * (and superseding) a second one.
 *
 * Both entry points take a per-user advisory lock, so the background kick-off
 * and the wizard can race without creating two runs.
 */
@Injectable()
export class OnboardingAnalysisStartService {
  private readonly logger = new Logger(OnboardingAnalysisStartService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private readonly contextAnalysisRepository: Repository<ContextAnalysis>,
    private readonly progressService: ContextAnalysisProgressService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Wizard path: join the user's running or finished analysis; start one only
   * when there is nothing to join (none yet, or the last one failed).
   */
  async joinOrStartAnalysis(userId: string): Promise<{ analysisId: string }> {
    return this.withStartLock(userId, async () => {
      const latest = await this.findLatestAnalysis(userId);
      if (latest && JOINABLE_STATUSES.includes(latest.status)) {
        this.logger.log(
          `Joining ${latest.status} analysis ${latest.id} for user ${userId}`,
        );
        return { analysisId: latest.id };
      }
      return this.progressService.startAnalysis(userId);
    });
  }

  /**
   * Background path, called when a sync is about to import a mailbox for the
   * first time. Best effort: only for users still onboarding with a mailbox
   * connected, only once per user (a failed run is left for the wizard's
   * retry rather than re-run on every sync), and never over the plan's AI
   * capacity. The cheap user check runs first because every sync calls this.
   * Never throws.
   */
  async startForNewMailbox(
    userId: string,
    isMailboxConnected: () => Promise<boolean>,
  ): Promise<void> {
    try {
      if (!(await this.isAwaitingFirstImport(userId))) return;
      if (!(await isMailboxConnected())) return;
      const { allowed } =
        await this.subscriptionsService.checkAiCapacity(userId);
      if (!allowed) return;
      const analysisId = await this.startIfNeverRun(userId);
      if (analysisId) {
        this.logger.log(
          `Started onboarding analysis ${analysisId} at mailbox connect for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not start onboarding analysis for user ${userId}; the wizard will start it: ${getErrorMessage(error)}`,
      );
    }
  }

  private async isAwaitingFirstImport(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return (
      !!user && !user.hasCompletedOnboarding && user.lastEmailSyncAt == null
    );
  }

  private async startIfNeverRun(userId: string): Promise<string | null> {
    return this.withStartLock(userId, async () => {
      if (await this.findLatestAnalysis(userId)) return null;
      const { analysisId } = await this.progressService.startAnalysis(userId);
      return analysisId;
    });
  }

  private findLatestAnalysis(userId: string): Promise<ContextAnalysis | null> {
    return this.contextAnalysisRepository.findOne({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Serialises starts per user. `startAnalysis` writes on its own connection
   * and commits before `work` returns, so a waiter that gets the lock next
   * always sees the run the holder created.
   */
  private withStartLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
    return this.contextAnalysisRepository.manager.transaction(
      async (manager) => {
        await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${START_LOCK_NAMESPACE}:${userId}`,
        ]);
        return work();
      },
    );
  }
}
