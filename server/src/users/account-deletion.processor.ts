import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DeletionReason } from "../database/entities/deleted-account.entity";
import { registerWorker } from "../queue/register-worker";
import { logErrorToFile } from "../utils/error-logger";
import { UsersService } from "./users.service";

const DEFAULT_DATA_RETENTION_DAYS = 30;

/**
 * Daily cron schedule: 3 AM UTC.
 * Runs outside peak hours to minimise DB load.
 */
const CLEANUP_CRON_SCHEDULE = "0 3 * * *";

function getDataRetentionDays(): number {
  const envVal = parseInt(process.env.DATA_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(envVal) && envVal > 0
    ? envVal
    : DEFAULT_DATA_RETENTION_DAYS;
}

@Injectable()
export class AccountDeletionProcessor implements OnModuleInit {
  private readonly logger = new Logger(AccountDeletionProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.schedule(
      JOB_NAMES.CLEANUP_INACTIVE_ACCOUNTS,
      CLEANUP_CRON_SCHEDULE,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.CLEANUP_INACTIVE_ACCOUNTS,
      async () => this.handleCleanupInactiveAccounts(),
    );
    this.logger.log(
      "AccountDeletionProcessor initialized — inactive-account cleanup scheduled at 03:00 UTC daily",
    );
  }

  async handleCleanupInactiveAccounts(): Promise<void> {
    const retentionDays = getDataRetentionDays();
    this.logger.log(
      `[AccountDeletion] Starting cleanup of accounts inactive for ${retentionDays}+ days`,
    );

    const userIds = await this.usersService.findUsersForDeletion(retentionDays);

    this.logger.log(
      `[AccountDeletion] Found ${userIds.length} accounts eligible for deletion`,
    );

    let deleted = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        await this.usersService.deleteAccount(
          userId,
          DeletionReason.INACTIVITY,
        );
        deleted++;
        this.logger.log(
          `[AccountDeletion] Deleted inactive account userId=${userId}`,
        );
      } catch (error: unknown) {
        errors++;
        this.logger.error(
          `[AccountDeletion] Failed to delete account userId=${userId}`,
          error,
        );
        logErrorToFile(
          `Failed to delete inactive account (userId: ${userId})`,
          error,
          "AccountDeletionProcessor",
        );
      }
    }

    this.logger.log(
      `[AccountDeletion] Cleanup complete: deleted=${deleted}, errors=${errors}`,
    );
  }
}
