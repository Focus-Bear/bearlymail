import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";
import {
  OrganizationNameRepairService,
  RepairOrganizationNamesResult,
} from "./organization-name-repair.service";

export interface RepairOrganizationNamesJobData {
  dryRun?: boolean;
}

/**
 * PgBoss worker for the admin-triggered `organizations.name` key repair.
 *
 * One sequential job walks every organization; the work is tiny (one table plus
 * an owner lookup, no LLM/network beyond KMS) and idempotent, since a row that
 * already decrypts under the global key is skipped. Returning the result
 * persists it as the job `output` so the admin UI can poll for the summary.
 */
@Injectable()
export class OrganizationNameRepairProcessor implements OnModuleInit {
  private readonly logger = new Logger(OrganizationNameRepairProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly repairService: OrganizationNameRepairService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.REPAIR_ORGANIZATION_NAMES,
      async (job) => {
        const { dryRun = false } =
          (job.data as RepairOrganizationNamesJobData) ?? {};
        this.logger.log(
          `Starting organizations.name repair${dryRun ? " (dry run)" : ""}`,
        );
        const result: RepairOrganizationNamesResult =
          await this.repairService.repairAll({ dryRun });
        return result;
      },
    );
    this.logger.log(
      `Worker registered: ${JOB_NAMES.REPAIR_ORGANIZATION_NAMES}`,
    );
  }
}
