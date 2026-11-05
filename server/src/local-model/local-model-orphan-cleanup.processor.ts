import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { logErrorToFile } from "../utils/error-logger";
import { LocalModelUserDataService } from "./local-model-user-data.service";

/** Daily at 04:00 UTC, after the 03:00 inactive-account cleanup. */
const CLEANUP_CRON_SCHEDULE = "0 4 * * *";
/** Keeps one run bounded; the next day's run carries on from what's left. */
const MAX_USERS_PER_RUN = 500;
const LOG_PREFIX = "[LocalModelOrphanCleanup]";

export interface OrphanCleanupResult {
  storedUsers: number;
  orphaned: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
}

/**
 * Deletes local-model data whose account no longer exists. Account deletion
 * removes it at the time, but accounts deleted before that existed, a failed
 * delete, or a trainer run finishing just after a deletion all leave files
 * behind, and the trainer retrains on whatever it finds.
 *
 * Deleting can't be undone, so this only reports what it would delete until
 * LOCAL_MODEL_ORPHAN_CLEANUP_DELETE is "true".
 */
@Injectable()
export class LocalModelOrphanCleanupProcessor implements OnModuleInit {
  private readonly logger = new Logger(LocalModelOrphanCleanupProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly userDataService: LocalModelUserDataService,
  ) {}

  /** LOCAL_MODELS_BUCKET is only set on the worker, so the web task stays out of this. */
  async onModuleInit(): Promise<void> {
    if (!this.configService.get<string>("LOCAL_MODELS_BUCKET")) {
      return;
    }
    await this.boss.schedule(
      JOB_NAMES.CLEANUP_ORPHANED_LOCAL_MODEL_DATA,
      CLEANUP_CRON_SCHEDULE,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.CLEANUP_ORPHANED_LOCAL_MODEL_DATA,
      async () => this.handleCleanup(),
    );
    // Also runs just after a deploy, so the report doesn't wait for 04:00.
    await this.boss.send(
      JOB_NAMES.CLEANUP_ORPHANED_LOCAL_MODEL_DATA,
      {},
      {
        singletonKey: "cleanup-orphaned-local-model-data-bootstrap",
        singletonSeconds: SECONDS.SIX_HOURS,
      },
    );
  }

  async handleCleanup(): Promise<OrphanCleanupResult> {
    const dryRun =
      this.configService.get<string>("LOCAL_MODEL_ORPHAN_CLEANUP_DELETE") !==
      BOOLEAN_STRING_VALUES.TRUE;
    const storedIds = await this.userDataService.findStoredUserIds();
    const result: OrphanCleanupResult = {
      storedUsers: storedIds.length,
      orphaned: 0,
      deleted: 0,
      failed: 0,
      dryRun,
    };
    if (storedIds.length === 0) {
      return result;
    }

    const existingIds = await this.usersService.findExistingUserIds(storedIds);
    // No matches at all means the lookup is wrong, not that everyone left.
    if (existingIds.size === 0) {
      this.logger.error(
        `${LOG_PREFIX} None of the ${storedIds.length} stored users exist. Stopping without deleting anything`,
      );
      return result;
    }

    const orphanedIds = storedIds.filter((id) => !existingIds.has(id));
    result.orphaned = orphanedIds.length;

    if (dryRun) {
      this.logger.log(
        `${LOG_PREFIX} DRY RUN: would delete data for ${orphanedIds.length} of ${storedIds.length} stored users. Set LOCAL_MODEL_ORPHAN_CLEANUP_DELETE=true to delete`,
      );
      return result;
    }

    await this.deleteOrphans(orphanedIds.slice(0, MAX_USERS_PER_RUN), result);
    this.logger.log(
      `${LOG_PREFIX} Finished: orphaned=${result.orphaned}, deleted=${result.deleted}, failed=${result.failed}`,
    );
    return result;
  }

  /** One user's failure doesn't stop the rest; the next run tries them again. */
  private async deleteOrphans(
    userIds: string[],
    result: OrphanCleanupResult,
  ): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.userDataService.deleteUserData(userId);
        result.deleted++;
      } catch (error: unknown) {
        result.failed++;
        this.logger.error(
          `${LOG_PREFIX} Failed to delete data for user ${userId}`,
          error,
        );
        logErrorToFile(
          `Failed to delete orphaned local-model data (userId: ${userId})`,
          error,
          "LocalModelOrphanCleanupProcessor",
        );
      }
    }
  }
}
