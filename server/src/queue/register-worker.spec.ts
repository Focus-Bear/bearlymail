import type { Job, PgBoss, WorkOptions } from "pg-boss";

import { registerWorker } from "./register-worker";

/**
 * pg-boss persists a single-job batch handler's return value as the job
 * `output` (see manager `complete(name, ids, ids.length === 1 ? result :
 * undefined)`). These tests capture the batch callback `registerWorker` hands
 * to `boss.work` and assert it forwards the single-job handler's return value,
 * so admin features that poll `getJobById().output` never see a null output on
 * a completed job.
 */
describe("registerWorker", () => {
  type BatchCallback = (jobs: Job[]) => Promise<unknown>;

  function makeBossCapturingWork(): {
    boss: PgBoss;
    getCallback: () => BatchCallback;
    getOptions: () => WorkOptions | undefined;
  } {
    let captured: BatchCallback | undefined;
    let capturedOptions: WorkOptions | undefined;
    const work = jest
      .fn()
      .mockImplementation(
        (
          _name: string,
          options: WorkOptions,
          callback: BatchCallback,
        ): Promise<string> => {
          capturedOptions = options;
          captured = callback;
          return Promise.resolve("worker-id");
        },
      );
    const boss = { work } as unknown as PgBoss;
    return {
      boss,
      getCallback: () => {
        if (!captured) throw new Error("boss.work callback was not captured");
        return captured;
      },
      getOptions: () => capturedOptions,
    };
  }

  function fakeJob(id: string): Job {
    return { id, name: "q", data: {} } as unknown as Job;
  }

  it("forwards the handler's return value as the batch callback result", async () => {
    const { boss, getCallback } = makeBossCapturingWork();
    const output = { enqueued: 42 };
    await registerWorker(boss, "q", async () => output);

    const result = await getCallback()([fakeJob("job-1")]);

    expect(result).toBe(output);
  });

  it("registers with batchSize 1 so pg-boss treats the return as job output", async () => {
    const { boss, getOptions } = makeBossCapturingWork();
    await registerWorker(boss, "q", async () => undefined);

    expect(getOptions()?.batchSize).toBe(1);
  });

  it("invokes the handler for the job in the batch", async () => {
    const { boss, getCallback } = makeBossCapturingWork();
    const handler = jest.fn().mockResolvedValue({ ok: true });
    await registerWorker(boss, "q", handler);

    const job = fakeJob("job-1");
    await getCallback()([job]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(job);
  });

  it("supports the (options, handler) overload and still returns the result", async () => {
    const { boss, getCallback, getOptions } = makeBossCapturingWork();
    const output = { done: true };
    await registerWorker(
      boss,
      "q",
      { pollingIntervalSeconds: 5 },
      async () => output,
    );

    expect(getOptions()?.pollingIntervalSeconds).toBe(5);
    expect(await getCallback()([fakeJob("job-1")])).toBe(output);
  });
});
