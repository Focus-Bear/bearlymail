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
import { RepairOrganizationNamesJobData } from "./organization-name-repair.processor";
import { RepairOrganizationNamesResult } from "./organization-name-repair.service";

/**
 * Admin endpoints for the one-shot `organizations.name` key repair, surfaced in
 * the re-encryption admin UI alongside the other backfills — all of them
 * re-key data under the encryption service and share that screen.
 */
@Controller("organizations/admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class OrganizationNameRepairController {
  private readonly logger = new Logger(OrganizationNameRepairController.name);

  constructor(@Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss) {}

  /**
   * Enqueue the repair as a background job and return its id. Run it with
   * `dryRun: true` first: that reports exactly which organizations would change
   * and where each recovered name came from, without writing anything.
   */
  @Post("repair-names/start")
  async startRepairNames(@Body() body: { dryRun?: boolean } = {}) {
    const dryRun = body?.dryRun ?? false;
    const jobData: RepairOrganizationNamesJobData = { dryRun };
    const jobId = await this.boss.send(
      JOB_NAMES.REPAIR_ORGANIZATION_NAMES,
      jobData,
      { priority: JobPriority.LOW, expireInSeconds: SECONDS.SIX_HOURS },
    );
    this.logger.log(
      `Enqueued organizations.name repair job ${jobId}${dryRun ? " (dry run)" : ""}`,
    );
    return { jobId, dryRun };
  }

  /**
   * Poll a repair job's state and (on completion) its persisted summary.
   * Returns `state: "not_found"` once PgBoss prunes the completed job.
   */
  @Get("repair-names/job/:jobId")
  async getRepairNamesJob(@Param("jobId") jobId: string) {
    const job = await this.boss.getJobById(
      JOB_NAMES.REPAIR_ORGANIZATION_NAMES,
      jobId,
    );
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as RepairOrganizationNamesResult | null) ?? null,
      createdOn: job.createdOn,
      completedOn: job.completedOn,
    };
  }
}
