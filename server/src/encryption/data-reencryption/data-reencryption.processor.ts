import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { User } from "../../database/entities/user.entity";
import { JobPriority } from "../../queue/job-priorities";
import { registerWorker } from "../../queue/register-worker";
import {
  DataReencryptionService,
  UserReencryptionResult,
} from "./data-reencryption.service";

export interface ReencryptUserDataJobData {
  userId: string;
  dryRun?: boolean;
}

export interface ReencryptFanoutJobData {
  dryRun?: boolean;
  /**
   * When true, enqueue re-encryption jobs for ALL users — including those
   * already stamped `dataReencryptedAt`. Required to clean up legacy bypassed
   * (plaintext-at-rest) columns in users the original migration marked done
   * before the bypassed-column handling existed. No-op when `dryRun` is true
   * (the dry-run scan already covers every user).
   */
  force?: boolean;
}

export interface ReencryptFanoutResult {
  enqueued: number;
  dryRun: boolean;
  /**
   * Job IDs of the per-user re-encryption jobs this fan-out enqueued. Stored
   * in the fan-out job's output so the admin UI can fetch each child job and
   * aggregate results across all users (pg-boss v9 `insert` returns void, so
   * we pre-generate UUIDs and pass them in via `JobInsert.id`).
   */
  childJobIds: string[];
}

@Injectable()
export class DataReencryptionProcessor implements OnModuleInit {
  private readonly logger = new Logger(DataReencryptionProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly service: DataReencryptionService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.REENCRYPT_USER_DATA,
      async (job) => {
        const { userId, dryRun } = job.data as ReencryptUserDataJobData;
        this.logger.log(
          `Re-encrypting data for user ${userId}${dryRun ? " (dry run)" : ""}`,
        );
        const result: UserReencryptionResult = await this.service.reencryptUser(
          userId,
          { dryRun },
        );
        this.logger.log(
          `Re-encryption complete for user ${userId}: ${JSON.stringify(summarise(result))}`,
        );
        // Returning the result persists it as `output` on the PgBoss job record,
        // so the admin UI can poll GET /admin/reencryption/job/:jobId to see the
        // per-table breakdown after a dry-run-self.
        return result;
      },
    );
    this.logger.log(`Worker registered: ${JOB_NAMES.REENCRYPT_USER_DATA}`);

    await registerWorker(
      this.boss,
      JOB_NAMES.REENCRYPT_FANOUT_ALL,
      async (job) => {
        const { dryRun = false, force = false } =
          job.data as ReencryptFanoutJobData;
        // Skip the dataReencryptedAt filter when dry-running (scan everyone) or
        // when an admin explicitly forces a rescan — needed to clean up legacy
        // bypassed columns in users the original migration marked done.
        const users = await this.userRepository
          .createQueryBuilder("u")
          .select(["u.id"])
          .where(dryRun || force ? "1=1" : "u.dataReencryptedAt IS NULL")
          .getMany();

        if (users.length === 0) {
          this.logger.log(
            `Fan-out: no eligible users${dryRun ? " (dry run)" : ""}`,
          );
          return {
            enqueued: 0,
            dryRun,
            childJobIds: [],
          } satisfies ReencryptFanoutResult;
        }

        // Pre-generate UUIDs so we can return them as the fan-out's output —
        // pg-boss v9's `insert()` returns void, so this is the only way to
        // surface child job IDs to the aggregation endpoint.
        const inserts = users.map((user) => ({
          id: crypto.randomUUID(),
          name: JOB_NAMES.REENCRYPT_USER_DATA,
          // eslint-disable-next-line id-denylist
          data: { userId: user.id, dryRun } as ReencryptUserDataJobData,
          priority: JobPriority.VERY_LOW,
        }));

        // Single bulk insert beats N round-trips to pg — the whole point of
        // moving fan-out off the HTTP path.
        await this.boss.insert(JOB_NAMES.REENCRYPT_USER_DATA, inserts);

        this.logger.log(
          `Fan-out: enqueued ${users.length} re-encryption jobs${dryRun ? " (dry run)" : ""}`,
        );
        return {
          enqueued: users.length,
          dryRun,
          childJobIds: inserts.map((insert) => insert.id),
        } satisfies ReencryptFanoutResult;
      },
    );
    this.logger.log(`Worker registered: ${JOB_NAMES.REENCRYPT_FANOUT_ALL}`);

    await registerWorker(
      this.boss,
      JOB_NAMES.REENCRYPT_HEALTH_SCAN,
      async () => {
        this.logger.log("Running data-at-rest health scan");
        // Runs in the worker (no ALB idle timeout) — the per-column SQL scans on
        // large tables can take tens of seconds. Returning the result persists it
        // as the job `output` so the admin UI can poll GET …/job/:jobId for it.
        const health = await this.service.getHealth();
        this.logger.log(
          `Health scan complete: ${health.rowsNeedingRemediation} row(s) need remediation across ${health.columnsAffected} column(s)`,
        );
        return health;
      },
    );
    this.logger.log(`Worker registered: ${JOB_NAMES.REENCRYPT_HEALTH_SCAN}`);
  }
}

function summarise(result: UserReencryptionResult): {
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
} {
  return result.tables.reduce(
    (acc, table) => ({
      rowsScanned: acc.rowsScanned + table.rowsScanned,
      rowsRewritten: acc.rowsRewritten + table.rowsRewritten,
      rowsAlreadyMigrated: acc.rowsAlreadyMigrated + table.rowsAlreadyMigrated,
      rowsFailed: acc.rowsFailed + table.rowsFailed,
    }),
    { rowsScanned: 0, rowsRewritten: 0, rowsAlreadyMigrated: 0, rowsFailed: 0 },
  );
}
