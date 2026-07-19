import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { JobPriority } from "../queue/job-priorities";
import { BackfillCategoryRuleIdsJobData } from "./category-rule-id-backfill.processor";
import { BackfillCategoryRuleIdsResult } from "./category-rule-id-backfill.service";

/**
 * Admin endpoints for the category-rule `categoryId` backfill, surfaced in the
 * re-encryption admin UI alongside the contact searchTokens backfill. Both
 * decrypt per-user data under each user's KMS key, so they share that screen.
 */
@Controller("category-rules/admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class CategoryRuleIdBackfillController {
  private readonly logger = new Logger(CategoryRuleIdBackfillController.name);

  constructor(@Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss) {}

  /**
   * Enqueue the backfill as a single background job and return its id. A
   * one-time backfill that decrypts per-user data can exceed the ALB idle
   * timeout, so it must not run on the HTTP request path. Idempotent, so a
   * retry on expiry resumes cleanly. Poll
   * `GET /category-rules/admin/backfill-ids/job/:jobId` for the summary.
   */
  @Post("backfill-ids/start")
  async startBackfillIds(@Body() body: { dryRun?: boolean } = {}) {
    const dryRun = body?.dryRun ?? false;
    const jobData: BackfillCategoryRuleIdsJobData = { dryRun };
    const jobId = await this.boss.send(
      JOB_NAMES.BACKFILL_CATEGORY_RULE_IDS,
      jobData,
      { priority: JobPriority.LOW, expireInSeconds: SECONDS.SIX_HOURS },
    );
    this.logger.log(
      `Enqueued category-rule categoryId backfill job ${jobId}${dryRun ? " (dry run)" : ""}`,
    );
    return { jobId, dryRun };
  }

  /**
   * Poll a backfill job's state and (on completion) its persisted summary.
   * Returns `state: "not_found"` once PgBoss prunes the completed job.
   */
  @Get("backfill-ids/job/:jobId")
  async getBackfillIdsJob(@Param("jobId") jobId: string) {
    const job = await this.boss.getJobById(
      JOB_NAMES.BACKFILL_CATEGORY_RULE_IDS,
      jobId,
    );
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as BackfillCategoryRuleIdsResult | null) ?? null,
      createdOn: job.createdOn,
      completedOn: job.completedOn,
    };
  }
}
