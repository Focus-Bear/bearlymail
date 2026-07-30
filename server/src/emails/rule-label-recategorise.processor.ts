import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Job, PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";
import {
  RecategoriseRuleThreadsResult,
  RuleLabelReCategoriseService,
} from "./rule-label-recategorise.service";

export interface RecategoriseRuleThreadsJobData {
  userId: string;
  dryRun?: boolean;
  limit?: number;
  lookbackHours?: number;
}

/**
 * PgBoss worker for the admin-triggered rule-label re-categorisation. One job
 * cleans up ONE user's rule-labelled threads (bounded by the service's per-run
 * cap). Idempotent — a PgBoss retry after an expired job re-selects only threads
 * not stamped within the look-back window. Returning the result persists it as
 * the job `output` so the admin endpoint can poll for the summary.
 */
@Injectable()
export class RuleLabelReCategoriseProcessor implements OnModuleInit {
  private readonly logger = new Logger(RuleLabelReCategoriseProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly service: RuleLabelReCategoriseService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.RECATEGORISE_RULE_LABELLED_THREADS,
      async (job: Job<RecategoriseRuleThreadsJobData>) => {
        const { userId, dryRun, limit, lookbackHours } = job.data ?? {};
        if (!userId) {
          throw new Error(
            "recategorise-rule-labelled-threads job requires a userId",
          );
        }
        const result: RecategoriseRuleThreadsResult =
          await this.service.recategoriseRuleLabelledThreads({
            userId,
            dryRun,
            limit,
            lookbackHours,
            workerId: job.id,
          });
        return result;
      },
    );
    this.logger.log(
      `Worker registered: ${JOB_NAMES.RECATEGORISE_RULE_LABELLED_THREADS}`,
    );
  }
}
