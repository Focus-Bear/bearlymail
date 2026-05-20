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
import {
  QUEUE_JOB_STATE,
  QueueJobState,
} from "../../constants/domain-statuses";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { User } from "../../database/entities/user.entity";
import { JobPriority } from "../../queue/job-priorities";
import {
  ReencryptFanoutJobData,
  ReencryptFanoutResult,
  ReencryptUserDataJobData,
} from "./data-reencryption.processor";
import {
  DataReencryptionService,
  ReencryptionFailureDetail,
  TableReencryptionResult,
  UserReencryptionResult,
} from "./data-reencryption.service";

type ChildJobState = QueueJobState | "not_found";

interface ChildJobSummary {
  jobId: string;
  userId: string | null;
  state: ChildJobState;
  output: UserReencryptionResult | null;
}

interface AggregatedTableSummary {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
}

/**
 * Same fields as ReencryptionFailureDetail plus the owning user, so the admin
 * UI can show which user each failure belongs to without a second lookup.
 */
export interface AggregatedFailureDetail extends ReencryptionFailureDetail {
  userId: string | null;
}

/**
 * Error details from a child job that failed at the PgBoss level (before any
 * rows were processed). PgBoss persists the thrown error as the job's output
 * (e.g. `{ message: "..." }`), which is otherwise invisible to the admin UI.
 */
export interface ChildJobError {
  jobId: string;
  userId: string | null;
  message: string;
}

interface FanoutResultsResponse {
  state: ChildJobState | "not_found";
  childrenTotal: number;
  childrenTerminal: number;
  childrenCompleted: number;
  childrenFailed: number;
  usersWithRowFailures: number;
  tables: AggregatedTableSummary[];
  failures: AggregatedFailureDetail[];
  childJobErrors: ChildJobError[];
  children: ChildJobSummary[];
}

const MAX_AGGREGATED_FAILURES = 200;
/**
 * How many child jobs to fetch concurrently. Bounded so a fan-out with
 * thousands of children doesn't saturate the database connection pool.
 */
const CHILD_FETCH_CHUNK_SIZE = 20;

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

  /**
   * Aggregate the per-user re-encryption jobs spawned by a fan-out.
   *
   * Reads the fan-out job's output to learn the child job IDs (we
   * pre-generate UUIDs at insert time — see processor), then fetches each
   * child and sums per-table totals + collects per-row failure diagnostics.
   *
   * Returns:
   * - `state: "not_found"` if the fan-out itself was pruned (PgBoss retains
   *   completed jobs ~24h by default).
   * - The fan-out's state, plus how many children have reached a terminal
   *   state, plus aggregated rows/failures across all completed children.
   *
   * Failures are capped at `MAX_AGGREGATED_FAILURES` across the whole
   * response to keep the payload bounded; each child also caps its own
   * failure list (see MAX_FAILURES_RETAINED_PER_TABLE in the service).
   */
  @Get("fanout/:jobId/results")
  async getFanoutResults(
    @Param("jobId") jobId: string,
  ): Promise<FanoutResultsResponse> {
    const fanoutJob = await this.boss.getJobById(jobId);
    if (!fanoutJob) {
      return {
        state: CHILD_STATE_NOT_FOUND,
        childrenTotal: 0,
        childrenTerminal: 0,
        childrenCompleted: 0,
        childrenFailed: 0,
        usersWithRowFailures: 0,
        tables: [],
        failures: [],
        childJobErrors: [],
        children: [],
      };
    }

    const output = fanoutJob.output as ReencryptFanoutResult | null;
    const childIds = output?.childJobIds ?? [];

    // Chunked concurrent reads to bound DB connection pool usage even when a
    // large user base produces thousands of child job IDs.
    const children: ChildJobSummary[] = [];
    for (let i = 0; i < childIds.length; i += CHILD_FETCH_CHUNK_SIZE) {
      const chunk = childIds.slice(i, i + CHILD_FETCH_CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (childId) => {
          const childJob = await this.boss.getJobById(childId);
          if (!childJob) {
            return {
              jobId: childId,
              userId: null,
              state: CHILD_STATE_NOT_FOUND,
              output: null,
            };
          }
          const childData = childJob.data as
            | ReencryptUserDataJobData
            | undefined;
          return {
            jobId: childId,
            userId: childData?.userId ?? null,
            state: childJob.state as ChildJobState,
            output: (childJob.output as UserReencryptionResult | null) ?? null,
          };
        }),
      );
      children.push(...chunkResults);
    }

    const aggregate = aggregateChildren(children);

    return {
      state: fanoutJob.state as ChildJobState,
      childrenTotal: children.length,
      ...aggregate,
      children,
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

const CHILD_STATE_NOT_FOUND: ChildJobState = "not_found";
const TERMINAL_CHILD_STATES: ReadonlySet<ChildJobState> = new Set([
  QUEUE_JOB_STATE.COMPLETED,
  QUEUE_JOB_STATE.FAILED,
  QUEUE_JOB_STATE.EXPIRED,
  QUEUE_JOB_STATE.CANCELLED,
  CHILD_STATE_NOT_FOUND,
]);

function aggregateChildren(children: ChildJobSummary[]): {
  childrenTerminal: number;
  childrenCompleted: number;
  childrenFailed: number;
  usersWithRowFailures: number;
  tables: AggregatedTableSummary[];
  failures: AggregatedFailureDetail[];
  childJobErrors: ChildJobError[];
} {
  let childrenTerminal = 0;
  let childrenCompleted = 0;
  let childrenFailed = 0;
  let usersWithRowFailures = 0;
  const tablesByName = new Map<string, AggregatedTableSummary>();
  const failures: AggregatedFailureDetail[] = [];
  const childJobErrors: ChildJobError[] = [];

  for (const child of children) {
    if (TERMINAL_CHILD_STATES.has(child.state)) childrenTerminal++;
    if (child.state === QUEUE_JOB_STATE.COMPLETED) childrenCompleted++;
    if (child.state === QUEUE_JOB_STATE.FAILED) {
      childrenFailed++;
      if (childJobErrors.length < MAX_AGGREGATED_FAILURES) {
        // PgBoss persists the thrown error as the job's output (e.g.
        // `{ message: "boom" }`). Extract the message so admins can see WHY
        // the job crashed rather than just seeing a count of "children failed".
        const errPayload = child.output as unknown as
          | { message?: string }
          | null;
        childJobErrors.push({
          jobId: child.jobId,
          userId: child.userId,
          message: errPayload?.message ?? "(no error message)",
        });
      }
    }

    // Only COMPLETED children carry the `UserReencryptionResult` output shape.
    // Failed jobs have whatever PgBoss persisted from the thrown error (e.g.
    // `{ message: "..." }`), which has no `tables` field. The type cast at the
    // call site (childJob.output as UserReencryptionResult | null) lies for
    // that path, so we runtime-guard before iterating to avoid a 500.
    if (child.state !== QUEUE_JOB_STATE.COMPLETED) continue;

    const out = child.output;
    if (!out || !Array.isArray(out.tables)) continue;

    let rowFailuresInThisUser = 0;
    for (const tableResult of out.tables) {
      rowFailuresInThisUser += tableResult.rowsFailed;
      addToTable(tablesByName, tableResult);
      // `failures` may be absent on outputs persisted before this field was
      // introduced — nullish-coalesce to keep aggregation backward compatible.
      for (const failure of tableResult.failures ?? []) {
        if (failures.length >= MAX_AGGREGATED_FAILURES) break;
        failures.push({ ...failure, userId: child.userId });
      }
    }
    if (rowFailuresInThisUser > 0) usersWithRowFailures++;
  }

  return {
    childrenTerminal,
    childrenCompleted,
    childrenFailed,
    usersWithRowFailures,
    tables: Array.from(tablesByName.values()).sort((left, right) =>
      left.table.localeCompare(right.table),
    ),
    failures,
    childJobErrors,
  };
}

function addToTable(
  byName: Map<string, AggregatedTableSummary>,
  result: TableReencryptionResult,
): void {
  const existing = byName.get(result.table);
  if (!existing) {
    byName.set(result.table, {
      table: result.table,
      rowsScanned: result.rowsScanned,
      rowsRewritten: result.rowsRewritten,
      rowsAlreadyMigrated: result.rowsAlreadyMigrated,
      rowsFailed: result.rowsFailed,
    });
    return;
  }
  existing.rowsScanned += result.rowsScanned;
  existing.rowsRewritten += result.rowsRewritten;
  existing.rowsAlreadyMigrated += result.rowsAlreadyMigrated;
  existing.rowsFailed += result.rowsFailed;
}
