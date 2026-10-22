import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";
import { AutoArchiveProposalsService } from "./auto-archive-proposals.service";

export interface MineAutoArchiveProposalsJobData {
  userId: string;
  /** Re-analyse every heavy sender, not just those with new mail. */
  forceFull?: boolean;
}

/** One in-flight mining job per user. */
export function mineJobSingletonKey(userId: string): string {
  return `${JOB_NAMES.MINE_AUTO_ARCHIVE_PROPOSALS}-${userId}`;
}

/**
 * Schedules and runs auto-archive proposal mining. A daily cron fans out one
 * low-priority job per recently active user; each job mines that user's own
 * mail inside their encryption context.
 */
@Injectable()
export class AutoArchiveProposalsProcessor implements OnModuleInit {
  private readonly logger = new Logger(AutoArchiveProposalsProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly proposalsService: AutoArchiveProposalsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.schedule(
      JOB_NAMES.SCHEDULE_AUTO_ARCHIVE_PROPOSALS,
      AUTO_ARCHIVE_PROPOSAL_CONFIG.SWEEP_CRON,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_AUTO_ARCHIVE_PROPOSALS,
      async () => this.enqueueActiveUsers(),
    );
    await registerWorker<MineAutoArchiveProposalsJobData>(
      this.boss,
      JOB_NAMES.MINE_AUTO_ARCHIVE_PROPOSALS,
      async (job) => {
        const { userId, forceFull } = job.data;
        return this.userEncryptionService.withUserKey(userId, () =>
          this.proposalsService.mineForUser(userId, { forceFull }),
        );
      },
    );
    this.logger.log("Auto-archive proposal mining registered");
  }

  /** Enqueues a mining job for one user (deduplicated while one is queued). */
  async enqueueUser(
    userId: string,
    options: { forceFull?: boolean; userTriggered?: boolean } = {},
  ): Promise<string | null> {
    const jobData: MineAutoArchiveProposalsJobData = {
      userId,
      forceFull: options.forceFull,
    };
    return this.boss.send(JOB_NAMES.MINE_AUTO_ARCHIVE_PROPOSALS, jobData, {
      priority: getJobPriority(
        JOB_NAMES.MINE_AUTO_ARCHIVE_PROPOSALS,
        options.userTriggered,
      ),
      singletonKey: mineJobSingletonKey(userId),
    });
  }

  /** Daily sweep: users who received mail recently. */
  async enqueueActiveUsers(): Promise<{ enqueued: number }> {
    const activeSince = new Date(
      Date.now() -
        AUTO_ARCHIVE_PROPOSAL_CONFIG.SWEEP_ACTIVE_WITHIN_DAYS *
          MILLISECONDS.DAY,
    );
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .select('DISTINCT email."userId"', "userId")
      .where('email."receivedAt" >= :activeSince', { activeSince })
      .limit(AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_USERS_PER_SWEEP)
      .getRawMany<{ userId: string }>();
    for (const { userId } of rows) {
      await this.enqueueUser(userId);
    }
    this.logger.log(
      `[AUTO-ARCHIVE] Enqueued proposal mining for ${rows.length} user(s)`,
    );
    return { enqueued: rows.length };
  }
}
