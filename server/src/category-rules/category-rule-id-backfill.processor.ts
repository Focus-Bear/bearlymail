import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";
import {
  BackfillCategoryRuleIdsResult,
  CategoryRuleIdBackfillService,
} from "./category-rule-id-backfill.service";

export interface BackfillCategoryRuleIdsJobData {
  dryRun?: boolean;
}

/**
 * PgBoss worker for the admin-triggered category-rule `categoryId` backfill.
 *
 * A single job walks every user with NULL-categoryId rules under their own KMS
 * key — see `CategoryRuleIdBackfillService.backfillAllUsers`. The work is light
 * (two tables, no LLM/network) and idempotent, so a single sequential job
 * suffices; if it expires mid-run, the PgBoss retry resumes from the rows still
 * left NULL. Returning the result persists it as the job `output` so the admin
 * UI can poll for the summary.
 */
@Injectable()
export class CategoryRuleIdBackfillProcessor implements OnModuleInit {
  private readonly logger = new Logger(CategoryRuleIdBackfillProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly backfillService: CategoryRuleIdBackfillService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.BACKFILL_CATEGORY_RULE_IDS,
      async (job) => {
        const { dryRun = false } =
          (job.data as BackfillCategoryRuleIdsJobData) ?? {};
        this.logger.log(
          `Starting category-rule categoryId backfill${dryRun ? " (dry run)" : ""}`,
        );
        const result: BackfillCategoryRuleIdsResult =
          await this.backfillService.backfillAllUsers({ dryRun });
        return result;
      },
    );
    this.logger.log(
      `Worker registered: ${JOB_NAMES.BACKFILL_CATEGORY_RULE_IDS}`,
    );
  }
}
