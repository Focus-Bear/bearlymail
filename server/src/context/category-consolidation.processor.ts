import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { CategoryConsolidationRunService } from "./category-consolidation-run.service";

/**
 * Runs background "Consolidate Categories" jobs. The work touches encrypted
 * category data, so it executes inside the user's encryption key context. A
 * single worker is enough — runs are infrequent and user-triggered.
 */
@Injectable()
export class CategoryConsolidationProcessor implements OnModuleInit {
  private readonly logger = new Logger(CategoryConsolidationProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly runService: CategoryConsolidationRunService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker(
      this.boss,
      JOB_NAMES.CONSOLIDATE_CATEGORIES,
      { teamSize: 1 } as { teamSize: number },
      async (job) => {
        const { userId, runId } = job.data as {
          userId: string;
          runId: string;
        };
        this.logger.log(
          `[CATEGORY-CONSOLIDATION] Worker running consolidation run ${runId} for user ${userId}`,
        );
        await this.userEncryptionService.withUserKey(userId, async () => {
          await this.runService.execute(runId, userId);
        });
      },
    );
    this.logger.log("Category consolidation worker registered");
  }
}
