import { JOB_NAMES } from "../constants/job-names";
import { PriorityBatchSchedulerService } from "./priority-batch-scheduler.service";

describe("PriorityBatchSchedulerService", () => {
  let boss: { send: jest.Mock };
  let service: PriorityBatchSchedulerService;

  beforeEach(() => {
    jest.useFakeTimers();
    boss = { send: jest.fn().mockResolvedValue("job-1") };
    service = new PriorityBatchSchedulerService(boss as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flushes a single buffered email as a REFINE_PRIORITY job after the debounce", async () => {
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    expect(boss.send).not.toHaveBeenCalled();

    await jest.runAllTimersAsync();

    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.REFINE_PRIORITY,
      { userId: "user-1", emailId: "email-1" },
      expect.objectContaining({ singletonKey: "refine-priority-email-1" }),
    );
  });

  it("flushes multiple buffered emails as ONE batch job", async () => {
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    await service.queueBatchPriorityRefinement("user-1", "email-2");
    await jest.runAllTimersAsync();

    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      { userId: "user-1", emailIds: ["email-1", "email-2"] },
      expect.anything(),
    );
  });

  it("flushes immediately when the buffer reaches BATCH_MAX_SIZE", async () => {
    for (let index = 0; index < 10; index++) {
      await service.queueBatchPriorityRefinement("user-1", `email-${index}`);
    }
    // No timer needed — the 10th email triggers the flush synchronously.
    expect(boss.send).toHaveBeenCalledTimes(1);
    const [, payload] = boss.send.mock.calls[0];
    expect(payload.emailIds).toHaveLength(10);
  });

  it("keeps per-user buffers independent", async () => {
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    await service.queueBatchPriorityRefinement("user-2", "email-2");
    await jest.runAllTimersAsync();

    expect(boss.send).toHaveBeenCalledTimes(2);
    const jobNames = boss.send.mock.calls.map(([name]) => name);
    expect(jobNames).toEqual([
      JOB_NAMES.REFINE_PRIORITY,
      JOB_NAMES.REFINE_PRIORITY,
    ]);
  });

  it("drains every user's buffer to PgBoss on shutdown (deploy inside the debounce window)", async () => {
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    await service.queueBatchPriorityRefinement("user-2", "email-2");
    await service.queueBatchPriorityRefinement("user-2", "email-3");

    // Shutdown fires BEFORE the 5s debounce timer — previously these emails
    // were silently dropped and their threads stuck on "Calculating…".
    await service.onModuleDestroy();

    expect(boss.send).toHaveBeenCalledTimes(2);
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.REFINE_PRIORITY,
      { userId: "user-1", emailId: "email-1" },
      expect.anything(),
    );
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      { userId: "user-2", emailIds: ["email-2", "email-3"] },
      expect.anything(),
    );

    // Buffers are empty afterwards — the debounce timers firing later must
    // not double-enqueue.
    await jest.runAllTimersAsync();
    expect(boss.send).toHaveBeenCalledTimes(2);
  });

  it("removes the user's map entry after a flush (no per-user accumulation)", async () => {
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    await jest.runAllTimersAsync();
    // Internal map must not retain drained buffers for the process lifetime.
    expect(
      (service as never as { priorityBatchBuffer: Map<string, unknown> })
        .priorityBatchBuffer.size,
    ).toBe(0);
  });

  it("survives enqueue failures on shutdown without throwing", async () => {
    boss.send.mockRejectedValue(new Error("pgboss down"));
    await service.queueBatchPriorityRefinement("user-1", "email-1");
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
