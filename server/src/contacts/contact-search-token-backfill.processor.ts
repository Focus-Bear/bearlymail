import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";
import {
  BackfillAllUsersResult,
  ContactsDebugAdminService,
} from "./contacts-debug-admin.service";

export interface BackfillContactSearchTokensJobData {
  dryRun?: boolean;
}

/**
 * PgBoss worker for the admin-triggered contact `searchTokens` backfill (#2030).
 *
 * A single job walks every user with NULL/empty-token contacts under their own
 * KMS key — see `ContactsDebugAdminService.backfillAllUsers`. The work is light
 * (one table, no LLM/network) and idempotent, so a single sequential job is
 * sufficient; if it expires mid-run, the PgBoss retry resumes from the rows
 * still left NULL. Returning the result persists it as the job `output` so the
 * admin UI can poll for the summary.
 */
@Injectable()
export class ContactSearchTokenBackfillProcessor implements OnModuleInit {
  private readonly logger = new Logger(
    ContactSearchTokenBackfillProcessor.name,
  );

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly contactsDebugAdminService: ContactsDebugAdminService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.BACKFILL_CONTACT_SEARCH_TOKENS,
      async (job) => {
        const { dryRun = false } =
          (job.data as BackfillContactSearchTokensJobData) ?? {};
        this.logger.log(
          `Starting contact searchTokens backfill${dryRun ? " (dry run)" : ""}`,
        );
        const result: BackfillAllUsersResult =
          await this.contactsDebugAdminService.backfillAllUsers({ dryRun });
        return result;
      },
    );
    this.logger.log(
      `Worker registered: ${JOB_NAMES.BACKFILL_CONTACT_SEARCH_TOKENS}`,
    );
  }
}
