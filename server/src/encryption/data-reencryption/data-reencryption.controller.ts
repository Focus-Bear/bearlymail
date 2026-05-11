import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import PgBoss from "pg-boss";
import { IsNull, Not, Repository } from "typeorm";

import { AdminGuard } from "../../auth/admin.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { User } from "../../database/entities/user.entity";
import { JobPriority } from "../../queue/job-priorities";
import {
  ReencryptFanoutJobData,
  ReencryptUserDataJobData,
} from "./data-reencryption.processor";
import {
  DataReencryptionService,
  UserReencryptionResult,
} from "./data-reencryption.service";

class ReencryptOneUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  dryRun?: boolean;
}

class StartReencryptionDto {
  @IsOptional()
  dryRun?: boolean;
}

@Controller("admin/reencryption")
@UseGuards(JwtAuthGuard, AdminGuard)
export class DataReencryptionController {
  private readonly logger = new Logger(DataReencryptionController.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly service: DataReencryptionService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Per-user state and aggregate progress.
   */
  @Get("status")
  async status() {
    const [migrated, pending, total] = await Promise.all([
      this.userRepository.count({
        where: { dataReencryptedAt: Not(IsNull()) },
      }),
      this.userRepository.count({ where: { dataReencryptedAt: IsNull() } }),
      this.userRepository.count(),
    ]);

    return {
      migratedUsers: migrated,
      pendingUsers: pending,
      totalUsers: total,
      tablesInScope: this.service.getTables().map((table) => table.tableName),
    };
  }

  /**
   * Enqueue a fan-out job that, in the worker, queries eligible users and
   * bulk-inserts one re-encryption job per user. Idempotent — already-migrated
   * users are skipped at job time.
   *
   * Returns immediately with a jobId. The previous shape iterated the user
   * table inside the request and sequentially `boss.send`ed one job per user;
   * with a large user base that exceeded the ALB idle timeout. Poll
   * `GET /admin/reencryption/job/:jobId` for completion and the enqueued count.
   */
  @Post("start")
  async startAll(@Body() body: StartReencryptionDto = {}) {
    const dryRun = body.dryRun ?? false;
    const jobData: ReencryptFanoutJobData = { dryRun };
    const jobId = await this.boss.send(
      JOB_NAMES.REENCRYPT_FANOUT_ALL,
      jobData,
      { priority: JobPriority.MEDIUM },
    );
    this.logger.log(
      `Enqueued fan-out job ${jobId}${dryRun ? " (dry run)" : ""}`,
    );
    return { jobId, dryRun };
  }

  /**
   * Enqueue a re-encryption job for one specific user. Useful for testing or
   * spot-fixing. Returns the job ID so the admin UI can poll for completion.
   */
  @Post("user")
  async startOne(@Body() body: ReencryptOneUserDto) {
    const dryRun = body.dryRun ?? false;
    const jobId = await this.enqueue(body.userId, dryRun);
    return { jobId, userId: body.userId, dryRun };
  }

  /**
   * Enqueue a dry-run job for the calling admin's own data. Returns a job ID
   * immediately so the request does not hold the ALB connection — a full
   * dry-run iterates every row in every user-scoped encrypted table and
   * regularly takes longer than the ALB idle timeout.
   *
   * Boosted to HIGH priority because this is an interactive admin debug action;
   * it must not sit behind a bulk job enqueued by /start.
   *
   * Poll GET /admin/reencryption/job/:jobId for state and (on completion) the
   * per-table result.
   */
  @Post("dry-run-self")
  async dryRunSelf(@Req() request: { user?: { userId?: string } }) {
    const userId = request?.user?.userId;
    if (!userId) {
      throw new Error("Could not resolve current user from request");
    }
    const jobData: ReencryptUserDataJobData = { userId, dryRun: true };
    const jobId = await this.boss.send(JOB_NAMES.REENCRYPT_USER_DATA, jobData, {
      priority: JobPriority.HIGH,
    });
    this.logger.log(`Enqueued dry-run-self for user ${userId} as job ${jobId}`);
    return { jobId, userId, dryRun: true };
  }

  /**
   * Poll a re-encryption job's state and (on completion) its persisted output.
   *
   * Returns `state: "not_found"` if the job has already been archived/pruned
   * by PgBoss (default retention is 24h on completed jobs) — clients should
   * stop polling and surface that as "result no longer available".
   */
  @Get("job/:jobId")
  async getJob(@Param("jobId") jobId: string) {
    const job = await this.boss.getJobById(jobId);
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as UserReencryptionResult | null) ?? null,
      createdOn: job.createdon,
      completedOn: job.completedon,
    };
  }

  private async enqueue(
    userId: string,
    dryRun: boolean,
  ): Promise<string | null> {
    const jobData: ReencryptUserDataJobData = { userId, dryRun };
    return this.boss.send(JOB_NAMES.REENCRYPT_USER_DATA, jobData, {
      priority: JobPriority.VERY_LOW,
    });
  }
}
