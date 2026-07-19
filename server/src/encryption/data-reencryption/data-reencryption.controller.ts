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
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import type { PgBoss } from "pg-boss";
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
import { ReencryptionHealth } from "./reencryption-health";

type ChildJobState = QueueJobState | "not_found";

/**
 * Every queue a reencryption job can live in. GET /job/:jobId must search all
 * of them: the admin UI polls that one endpoint for dry-run/user-data,
 * health-scan AND fan-out jobs, and PgBoss getJobById is scoped per queue.
 */
const REENCRYPTION_JOB_QUEUES = [
  JOB_NAMES.REENCRYPT_USER_DATA,
  JOB_NAMES.REENCRYPT_HEALTH_SCAN,
  JOB_NAMES.REENCRYPT_FANOUT_ALL,
] as const;

type ReencryptionJobOutput =
  | UserReencryptionResult
  | ReencryptionHealth
  | ReencryptFanoutResult;

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
  rowsCleared: number;
}

/**
 * Same fields as ReencryptionFailureDetail plus the owning user, so the admin
 * UI can show which user each failure belongs to without a second lookup.
 */
export interface AggregatedFailureDetail extends ReencryptionFailureDetail {
  userId: string | null;
}

/**
 * Error details from a child job that did not complete cleanly. Covers both
 * FAILED (PgBoss persists the thrown error as the job's output) and
 * EXPIRED/CANCELLED/NOT_FOUND (no output captured) — in every case, the admin
 * UI gets at least the state and whatever payload PgBoss recorded so they can
 * diagnose without digging through worker logs.
 *
 * `outputPreview` is a JSON-stringified snippet (truncated) of the raw PgBoss
 * output. Always populated when output is non-null — even if we successfully
 * extracted `message`, the preview helps diagnose unfamiliar error shapes.
 */
export interface ChildJobError {
  jobId: string;
  userId: string | null;
  state: ChildJobState;
  message: string;
  outputPreview: string | null;
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
// CloudWatch caps log events at 256KB; keep the per-warn payload well under
// that even when worker stack traces are several KB each.
const LOG_SAMPLE_SIZE = 10;
const LOG_MESSAGE_MAX_CHARS = 200;

class ReencryptOneUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  dryRun?: boolean;
}

class StartReencryptionDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /**
   * When true, the fan-out enqueues re-encryption for ALL users — including
   * those already stamped `dataReencryptedAt`. Use to remediate legacy
   * bypassed columns the original migration could not touch (because they
   * were not ciphertext-shaped). No-op together with `dryRun`.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
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
   * Truthful health of the encrypted data at rest. Unlike `/status` (which only
   * reports the `dataReencryptedAt` job-visited stamp), this scans every
   * encrypted column and reports how many rows actually hold plaintext-at-rest
   * values — the real "needs remediation" number. Read-only; safe to poll.
   */
  @Get("health")
  async health() {
    return this.service.getHealth();
  }

  /**
   * Enqueue the data-at-rest health scan as a background job and return a jobId.
   * The synchronous GET /health above scans large tables (emails, email_threads)
   * and routinely exceeds the ALB idle timeout, leaving the dashboard stuck
   * loading — so the UI uses this job path and polls GET …/job/:jobId for the
   * ReencryptionHealth output. HIGH priority: it's an interactive admin action.
   */
  @Post("health/scan")
  async startHealthScan() {
    const jobId = await this.boss.send(
      JOB_NAMES.REENCRYPT_HEALTH_SCAN,
      {},
      { priority: JobPriority.HIGH },
    );
    this.logger.log(`Enqueued health scan as job ${jobId}`);
    return { jobId };
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
    const force = body.force ?? false;
    const jobData: ReencryptFanoutJobData = { dryRun, force };
    const jobId = await this.boss.send(
      JOB_NAMES.REENCRYPT_FANOUT_ALL,
      jobData,
      { priority: JobPriority.MEDIUM },
    );
    this.logger.log(
      `Enqueued fan-out job ${jobId}${dryRun ? " (dry run)" : ""}${force ? " (force-rescan)" : ""}`,
    );
    return { jobId, dryRun, force };
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
   * Searches every reencryption queue: the admin UI polls this one endpoint
   * for user-data, health-scan and fan-out jobs alike, and PgBoss getJobById
   * only matches within a single queue. (Searching just reencrypt-user-data
   * made health-scan and fan-out jobs report not_found even while running.)
   *
   * Returns `state: "not_found"` if the job has already been archived/pruned
   * by PgBoss (default retention is 24h on completed jobs) — clients should
   * stop polling and surface that as "result no longer available".
   */
  @Get("job/:jobId")
  async getJob(@Param("jobId") jobId: string) {
    // Concurrent on purpose; Promise.all (not allSettled) also on purpose — a
    // transient lookup failure must surface as a 500 (the UI poll loop
    // retries on errors) rather than collapse into not_found, which the UI
    // treats as terminal and stops polling.
    const jobs = await Promise.all(
      REENCRYPTION_JOB_QUEUES.map((queue) =>
        this.boss.getJobById(queue, jobId),
      ),
    );
    const job = jobs.find((match) => match != null);
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as ReencryptionJobOutput | null) ?? null,
      createdOn: job.createdOn,
      completedOn: job.completedOn,
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
    const fanoutJob = await this.boss.getJobById(
      JOB_NAMES.REENCRYPT_FANOUT_ALL,
      jobId,
    );
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
          const childJob = await this.boss.getJobById(
            JOB_NAMES.REENCRYPT_USER_DATA,
            childId,
          );
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

    if (aggregate.childJobErrors.length > 0) {
      // Mirror the surfaced messages into the web-service logs so an operator
      // sees the same diagnostic text whether they look in the admin UI or in
      // CloudWatch. Cap to a handful of truncated examples — at
      // MAX_AGGREGATED_FAILURES=200 entries × multi-KB stack traces a full
      // dump can blow past CloudWatch's 256KB per-event limit.
      const summary = JSON.stringify(
        aggregate.childJobErrors.slice(0, LOG_SAMPLE_SIZE).map((err) => ({
          jobId: err.jobId,
          userId: err.userId,
          state: err.state,
          message:
            err.message.length > LOG_MESSAGE_MAX_CHARS
              ? `${err.message.slice(0, LOG_MESSAGE_MAX_CHARS)}…`
              : err.message,
        })),
      );
      this.logger.warn(
        `Fan-out ${jobId} surfaced ${aggregate.childJobErrors.length} non-completed child(ren). First ${Math.min(aggregate.childJobErrors.length, LOG_SAMPLE_SIZE)}: ${summary}`,
      );
    }

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

/**
 * States that mean "the child did not complete successfully" and should
 * appear in the job-level errors table. FAILED is the common case (handler
 * threw); EXPIRED is the job sat in `active` past its `expireIn` window;
 * CANCELLED is an operator action; NOT_FOUND means PgBoss already pruned it
 * (default 4-day retention on failed, 24h on completed) so we can't tell.
 */
const NON_COMPLETED_TERMINAL_STATES: ReadonlySet<ChildJobState> = new Set([
  QUEUE_JOB_STATE.FAILED,
  QUEUE_JOB_STATE.EXPIRED,
  QUEUE_JOB_STATE.CANCELLED,
  CHILD_STATE_NOT_FOUND,
]);

const OUTPUT_PREVIEW_MAX_CHARS = 500;

/**
 * Pull a human-readable error message out of a PgBoss failed-job output.
 * PgBoss runs the thrown value through `serialize-error`, so an `Error` ends
 * up as `{ name, message, stack }`. But not everything thrown is an Error —
 * worker code (or libraries it calls) can throw strings, plain objects, or
 * even `undefined`, and serialize-error preserves that shape. Without this
 * defensive lookup, the admin UI silently hides a failure they need to see.
 */
function extractErrorMessage(state: ChildJobState, output: unknown): string {
  if (state === CHILD_STATE_NOT_FOUND) {
    return "(job pruned by pg-boss — no diagnostic available; reduce retention or check worker logs)";
  }
  if (state === QUEUE_JOB_STATE.EXPIRED) {
    return "(job expired — worker did not finish within `expireIn`; likely hung or crashed mid-run)";
  }
  if (state === QUEUE_JOB_STATE.CANCELLED) {
    return "(job cancelled before it ran)";
  }
  if (output === null || output === undefined) {
    return "(pg-boss recorded no output for this failed job — worker process may have crashed before `.fail()` could persist the error)";
  }
  if (typeof output === "string") return output;
  if (typeof output !== "object") return String(output);

  // serialize-error shapes (Error → { name, message, stack }), but also handle
  // plain-object throws and the `{ value: ... }` wrapping pg-boss applies to
  // primitive throws.
  const payload = output as Record<string, unknown>;
  const candidates = [
    payload.message,
    (payload.error as Record<string, unknown> | undefined)?.message,
    payload.value,
    payload.reason,
    payload.detail,
    payload.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return "(failed job has no `message` field — see raw output preview)";
}

function previewOutput(output: unknown): string | null {
  if (output === null || output === undefined) return null;
  try {
    const json = JSON.stringify(output);
    return json.length > OUTPUT_PREVIEW_MAX_CHARS
      ? `${json.slice(0, OUTPUT_PREVIEW_MAX_CHARS)}…`
      : json;
  } catch {
    return "(output not JSON-serialisable)";
  }
}

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
    if (NON_COMPLETED_TERMINAL_STATES.has(child.state)) childrenFailed++;

    // Surface every non-completed terminal child — not just FAILED. Expired or
    // pruned jobs leave the admin with the same "5 children failed, no idea
    // why" symptom otherwise.
    if (
      NON_COMPLETED_TERMINAL_STATES.has(child.state) &&
      childJobErrors.length < MAX_AGGREGATED_FAILURES
    ) {
      childJobErrors.push({
        jobId: child.jobId,
        userId: child.userId,
        state: child.state,
        message: extractErrorMessage(child.state, child.output),
        outputPreview: previewOutput(child.output),
      });
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
      rowsCleared: result.rowsCleared ?? 0,
    });
    return;
  }
  existing.rowsScanned += result.rowsScanned;
  existing.rowsRewritten += result.rowsRewritten;
  existing.rowsAlreadyMigrated += result.rowsAlreadyMigrated;
  existing.rowsFailed += result.rowsFailed;
  existing.rowsCleared += result.rowsCleared ?? 0;
}
