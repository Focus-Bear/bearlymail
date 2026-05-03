import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import PgBoss from "pg-boss";

import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import {
  DataReencryptionService,
  UserReencryptionResult,
} from "./data-reencryption.service";

export interface ReencryptUserDataJobData {
  userId: string;
  dryRun?: boolean;
}

@Injectable()
export class DataReencryptionProcessor implements OnModuleInit {
  private readonly logger = new Logger(DataReencryptionProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly service: DataReencryptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work(JOB_NAMES.REENCRYPT_USER_DATA, async (job) => {
      const { userId, dryRun } = job.data as ReencryptUserDataJobData;
      this.logger.log(
        `Re-encrypting data for user ${userId}${dryRun ? " (dry run)" : ""}`,
      );
      const result: UserReencryptionResult = await this.service.reencryptUser(
        userId,
        {
          dryRun,
        },
      );
      this.logger.log(
        `Re-encryption complete for user ${userId}: ${JSON.stringify(summarise(result))}`,
      );
    });
    this.logger.log(`Worker registered: ${JOB_NAMES.REENCRYPT_USER_DATA}`);
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
