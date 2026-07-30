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
import { RecategoriseRuleThreadsJobData } from "./rule-label-recategorise.processor";
import { RecategoriseRuleThreadsResult } from "./rule-label-recategorise.service";

interface StartRecategoriseBody {
  userId: string;
  dryRun?: boolean;
  limit?: number;
  lookbackHours?: number;
}

/**
 * Admin endpoints to trigger and poll the bounded rule-label re-categorisation
 * job (clean up stale rule labels so the local model retrains on trustworthy
 * labels). Deliberately NOT auto-run from anywhere in code — it re-runs the LLM
 * per orphaned thread, so it must be invoked explicitly by an admin.
 *
 * Registered before EmailsController so its static `admin/...` paths are not
 * shadowed by EmailsController's `@Get(":id")`.
 */
@Controller("emails/admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class RuleLabelReCategoriseController {
  private readonly logger = new Logger(RuleLabelReCategoriseController.name);

  constructor(@Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss) {}

  /**
   * Enqueue a re-categorisation run for one user as a low-priority background
   * job (it can exceed the ALB idle timeout, so it must not run on the HTTP
   * request path). Pass `dryRun: true` first to get counts — how many threads
   * are rule-labelled, how many would keep a rule label vs. hit the LLM — with
   * NO writes. Poll `GET /emails/admin/recategorise-rule-threads/job/:jobId`.
   */
  @Post("recategorise-rule-threads/start")
  async startRecategorise(@Body() body: StartRecategoriseBody) {
    if (!body?.userId) {
      throw new Error("userId is required");
    }
    const jobData: RecategoriseRuleThreadsJobData = {
      userId: body.userId,
      dryRun: body.dryRun ?? false,
      limit: body.limit,
      lookbackHours: body.lookbackHours,
    };
    const jobId = await this.boss.send(
      JOB_NAMES.RECATEGORISE_RULE_LABELLED_THREADS,
      jobData,
      { priority: JobPriority.VERY_LOW, expireInSeconds: SECONDS.SIX_HOURS },
    );
    this.logger.log(
      `Enqueued rule-label re-categorisation job ${jobId} for user ${body.userId}` +
        `${jobData.dryRun ? " (dry run)" : ""}`,
    );
    return { jobId, ...jobData };
  }

  /**
   * Poll a re-categorisation job's state and (on completion) its persisted
   * summary. Returns `state: "not_found"` once PgBoss prunes the completed job.
   */
  @Get("recategorise-rule-threads/job/:jobId")
  async getRecategoriseJob(@Param("jobId") jobId: string) {
    const job = await this.boss.getJobById(
      JOB_NAMES.RECATEGORISE_RULE_LABELLED_THREADS,
      jobId,
    );
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as RecategoriseRuleThreadsResult | null) ?? null,
      createdOn: job.createdOn,
      completedOn: job.completedOn,
    };
  }
}
