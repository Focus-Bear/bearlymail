import type { Job } from "pg-boss";

import type { DiscoveryBatchJob } from "./context-discovery.types";
import { ContextDiscoveryBatchProcessor } from "./context-discovery-batch.processor";

const jobData: DiscoveryBatchJob = {
  userId: "user-1",
  analysisRecordId: "analysis-1",
  batchIndex: 0,
  totalBatches: 2,
  threads: [
    {
      threadId: "t1",
      from: "priya@northwind.io",
      subject: "Rollout",
      snippet: "Can we move it?",
      receivedAt: "2026-09-01T00:00:00.000Z",
      userReplied: true,
    },
  ],
  userEmail: "me@example.com",
  existingCategories: [],
  existingVipContacts: [],
};

describe("ContextDiscoveryBatchProcessor", () => {
  let llmService: { discoverUserContext: jest.Mock };
  let repository: { findOne: jest.Mock; save: jest.Mock };
  let usersService: { update: jest.Mock };
  let subscriptionsService: { checkAiCapacity: jest.Mock };
  let processor: ContextDiscoveryBatchProcessor;
  let record: {
    id: string;
    analyzedCount: number;
    stats: Record<string, unknown>;
  };

  const runJob = () =>
    (
      processor as unknown as {
        handleDiscoveryBatchJob: (job: Job<DiscoveryBatchJob>) => Promise<void>;
      }
    ).handleDiscoveryBatchJob({ id: "job-1", data: jobData } as never);

  beforeEach(() => {
    record = {
      id: "analysis-1",
      analyzedCount: 0,
      stats: { batchResults: {}, totalBatches: 2 },
    };
    llmService = {
      discoverUserContext: jest.fn().mockResolvedValue({
        categories: [{ name: "📰 Newsletters", description: "digests" }],
        vipContacts: [{ name: "Priya Raman" }],
        urgentHints: [],
        notUrgentHints: [],
      }),
    };
    repository = {
      findOne: jest.fn().mockResolvedValue(record),
      save: jest.fn().mockResolvedValue(undefined),
    };
    usersService = { update: jest.fn().mockResolvedValue(undefined) };
    subscriptionsService = {
      checkAiCapacity: jest
        .fn()
        .mockResolvedValue({ allowed: true, percentUsed: 0 }),
    };
    processor = new ContextDiscoveryBatchProcessor(
      {} as never,
      llmService as never,
      repository as never,
      usersService as never,
      {
        putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        withUserKey: jest.fn((_id: string, fn: () => unknown) => fn()),
      } as never,
      subscriptionsService as never,
    );
  });

  it("stores the discovery result on the analysis record and advances progress", async () => {
    await runJob();

    expect(llmService.discoverUserContext).toHaveBeenCalledWith(
      expect.objectContaining({
        threads: jobData.threads,
        userEmail: "me@example.com",
        userId: "user-1",
      }),
    );
    const stored = (record.stats.batchResults as Record<string, unknown>)[
      "0"
    ] as Record<string, unknown>;
    expect(stored).toMatchObject({
      categories: [{ name: "📰 Newsletters", description: "digests" }],
      vipContacts: [{ name: "Priya Raman" }],
      threadIds: ["t1"],
    });
    expect(record.analyzedCount).toBe(1);
    expect(record.stats.failedBatches).toEqual([]);
    // 1 of 2 batches done → 30 + 20 = 50%
    expect(usersService.update).toHaveBeenCalledWith("user-1", {
      scanProgress: 50,
      scanTotal: 100,
    });
  });

  it("records a failure (and never throws) when discovery returns nothing", async () => {
    llmService.discoverUserContext.mockResolvedValue(null);

    await expect(runJob()).resolves.toBeUndefined();

    const stored = (record.stats.batchResults as Record<string, unknown>)[
      "0"
    ] as Record<string, unknown>;
    expect(stored.error).toBeDefined();
    expect(record.stats.failedBatches).toEqual([0]);
    expect(usersService.update).not.toHaveBeenCalled();
  });

  it("skips the LLM and records an ai_volume_limit failure when capacity is exhausted", async () => {
    subscriptionsService.checkAiCapacity.mockResolvedValue({
      allowed: false,
      percentUsed: 100,
    });

    await runJob();

    expect(llmService.discoverUserContext).not.toHaveBeenCalled();
    const stored = (record.stats.batchResults as Record<string, unknown>)[
      "0"
    ] as Record<string, unknown>;
    expect(stored.errorType).toBe("ai_volume_limit");
  });

  it("does not double-count analyzedCount when a batch is re-run", async () => {
    record.stats.batchResults = { "0": { categories: [] } };
    record.analyzedCount = 1;

    await runJob();

    expect(record.analyzedCount).toBe(1);
  });
});
