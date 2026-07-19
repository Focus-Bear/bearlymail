import type { Job, PgBoss, WorkOptions } from "pg-boss";

/**
 * v9-era work options. `teamSize` / `teamConcurrency` were removed in pg-boss
 * v10; we accept them here only so existing call sites keep compiling, and map
 * them away (see below). `pollingIntervalSeconds` / `priority` still exist.
 */
interface LegacyWorkOptions {
  teamSize?: number;
  teamConcurrency?: number;
  pollingIntervalSeconds?: number;
  priority?: boolean;
}

type SingleJobHandler<ReqData> = (job: Job<ReqData>) => Promise<unknown>;

/**
 * Registers a pg-boss worker using a single-job handler.
 *
 * pg-boss v10 changed `work()` to deliver a `Job[]` batch and removed the v9
 * `teamSize` / `teamConcurrency` concurrency knobs. This adapter registers with
 * `batchSize: 1` and runs the supplied single-job handler for exactly one job per
 * invocation, preserving pre-v10 semantics:
 *
 * - **Correctness:** a v10 batch handler completes/fails *all* jobs in the batch
 *   together, so `batchSize > 1` would re-run already-succeeded jobs whenever any
 *   single job in the batch throws — duplicate side effects (e.g. duplicate sends).
 *   `batchSize: 1` keeps failure isolated to the one job that threw.
 * - **Concurrency:** the parallelism `teamConcurrency` used to provide now comes
 *   from running multiple worker processes (see `worker.ts` cluster mode). If a
 *   specific queue needs more throughput, scale workers rather than batching.
 *
 * Call this instead of `boss.work(...)` so handler bodies stay written for one job.
 */
export function registerWorker<ReqData = object>(
  boss: PgBoss,
  name: string,
  optionsOrHandler: LegacyWorkOptions | SingleJobHandler<ReqData>,
  maybeHandler?: SingleJobHandler<ReqData>,
): Promise<string> {
  const hasOptions = typeof optionsOrHandler !== "function";
  const legacy = (hasOptions ? optionsOrHandler : {}) as LegacyWorkOptions;
  const handler = (
    hasOptions ? maybeHandler : optionsOrHandler
  ) as SingleJobHandler<ReqData>;

  const options: WorkOptions = { batchSize: 1 };
  if (legacy.pollingIntervalSeconds !== undefined) {
    options.pollingIntervalSeconds = legacy.pollingIntervalSeconds;
  }
  if (legacy.priority !== undefined) {
    options.priority = legacy.priority;
  }

  return boss.work<ReqData>(name, options, async (jobs) => {
    for (const job of jobs) {
      await handler(job);
    }
  });
}
