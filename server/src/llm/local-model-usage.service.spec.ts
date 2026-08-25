import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelSupervision } from "../database/entities/local-model-supervision.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LocalModelUsageService } from "./local-model-usage.service";

/**
 * The query builder is called twice (prioritySource, then categorySource); each
 * `getRawMany` returns the next queued result set.
 */
type SourceRow = { source: string | null; count: string; deferred?: string };

function makeRepo(resultSets: SourceRow[][]) {
  let call = 0;
  const qb = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    getRawMany: jest.fn(() => Promise.resolve(resultSets[call++] ?? [])),
  };
  return { createQueryBuilder: jest.fn(() => qb) };
}

/** Minimal shape of a supervision row the accuracy aggregation reads. */
type SupervisionRow = {
  userId: string;
  categoryHash: string;
  category: string;
  sampleRatePercent: number;
  lifetimeSamples: number;
  lifetimeAgreements: number;
  windowSamples: number;
  windowAgreements: number;
};

function makeSupervisionRepo(rows: SupervisionRow[]) {
  // First call (counters) has no `where.userId`; the name-resolution call passes
  // `where: { userId, categoryHash: In(...) }` so it only sees that owner's rows
  // — mirroring how prod decrypts each name under its owner key.
  return {
    find: jest.fn((opts?: { where?: { userId?: string } }) => {
      const userId = opts?.where?.userId;
      return Promise.resolve(
        userId ? rows.filter((row) => row.userId === userId) : rows,
      );
    }),
  };
}

/** withUserKey just runs the task (KMS-disabled no-op semantics). */
function makeUserEncryption() {
  return {
    withUserKey: jest.fn(<T>(_userId: string, task: () => Promise<T>) =>
      task(),
    ),
  };
}

async function buildWith(
  resultSets: SourceRow[][],
  supervisionRows: SupervisionRow[] = [],
) {
  const repo = makeRepo(resultSets);
  const supervisionRepo = makeSupervisionRepo(supervisionRows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      LocalModelUsageService,
      { provide: getRepositoryToken(EmailThread), useValue: repo },
      {
        provide: getRepositoryToken(LocalModelSupervision),
        useValue: supervisionRepo,
      },
      { provide: UserEncryptionService, useValue: makeUserEncryption() },
    ],
  }).compile();
  return moduleRef.get(LocalModelUsageService);
}

async function build(resultSets: SourceRow[][]) {
  return buildWith(resultSets);
}

describe("LocalModelUsageService", () => {
  it("aggregates priority sources with correct counts and percentages", async () => {
    const service = await build([
      [
        { source: "local", count: "70" },
        { source: "llm", count: "20" },
        { source: "rule", count: "5" },
        { source: null, count: "5" },
      ],
      [],
    ]);

    const { priority } = await service.getUsage({});

    expect(priority).toEqual({
      local: 70,
      llm: 20,
      rule: 5,
      unprocessed: 5,
      deferred: 0,
      pending: 5,
      total: 100,
      localPct: 70,
      llmPct: 20,
    });
  });

  it("counts unexpected priority sources toward total and the LLM bucket", async () => {
    const service = await build([
      [
        { source: "local", count: "50" },
        { source: "rule", count: "10" },
        // "priority" is an unexpected value, not one of the hardcoded buckets.
        { source: "priority", count: "30" },
        { source: null, count: "10" },
      ],
      [],
    ]);

    const { priority } = await service.getUsage({});

    // total sums every row (100); the unexpected "priority" source falls into llm.
    expect(priority.total).toBe(100);
    expect(priority.llm).toBe(30);
    expect(priority.local).toBe(50);
    expect(priority.rule).toBe(10);
    expect(priority.unprocessed).toBe(10);
    expect(priority.llmPct).toBe(30);
  });

  it("breaks out deterministic rules and folds other sources into LLM", async () => {
    const service = await build([
      [],
      [
        { source: "local", count: "40" },
        { source: "summary", count: "25" },
        { source: "priority", count: "15" },
        { source: "rule", count: "10" },
        { source: null, count: "10" },
      ],
    ]);

    const { category } = await service.getUsage({});

    // rule (10) is its own bucket; llm = summary (25) + priority (15)
    expect(category).toEqual({
      local: 40,
      llm: 40,
      rule: 10,
      unprocessed: 10,
      deferred: 0,
      pending: 10,
      total: 100,
      localPct: 40,
    });
  });

  it("splits the NULL bucket into deferred (by design) and pending (awaiting scoring)", async () => {
    const service = await build([
      [
        { source: "local", count: "60" },
        { source: "rule", count: "10" },
        // 30 unprocessed threads: 18 deferred by design, 12 genuinely pending.
        { source: null, count: "30", deferred: "18" },
      ],
      [],
    ]);

    const { priority } = await service.getUsage({});

    // Deferred threads are excluded from pending; the two sum to unprocessed.
    expect(priority.deferred).toBe(18);
    expect(priority.pending).toBe(12);
    expect(priority.deferred + priority.pending).toBe(priority.unprocessed);
    // The existing bucket math is unchanged by the split.
    expect(priority.unprocessed).toBe(30);
    expect(priority.total).toBe(100);
    expect(priority.local).toBe(60);
    expect(priority.rule).toBe(10);
    expect(priority.llm).toBe(0);
  });

  it("treats a non-deferred NULL-source thread as pending, not deferred", async () => {
    const service = await build([
      [
        { source: "local", count: "80" },
        // No deferred rows in the NULL group.
        { source: null, count: "20", deferred: "0" },
      ],
      [],
    ]);

    const { priority } = await service.getUsage({});

    expect(priority.deferred).toBe(0);
    expect(priority.pending).toBe(20);
    expect(priority.deferred + priority.pending).toBe(priority.unprocessed);
  });

  it("returns zeroed percentages when there is no data", async () => {
    const service = await build([[], []]);

    const usage = await service.getUsage({});

    expect(usage.priority.total).toBe(0);
    expect(usage.priority.localPct).toBe(0);
    expect(usage.category.localPct).toBe(0);
    expect(usage.window.startDate).toBeDefined();
  });
});

describe("LocalModelUsageService.getCategoryAccuracy", () => {
  it("aggregates rows of the same category across users and picks the dominant row", async () => {
    const service = await buildWith(
      [],
      [
        {
          userId: "user-a",
          categoryHash: "hash-news",
          category: "newsletters",
          sampleRatePercent: 25,
          lifetimeSamples: 40,
          lifetimeAgreements: 30,
          windowSamples: 5,
          windowAgreements: 4,
        },
        {
          // Dominant row for the same hash (more lifetime samples) — its name
          // and rate win.
          userId: "user-b",
          categoryHash: "hash-news",
          category: "Newsletters",
          sampleRatePercent: 10,
          lifetimeSamples: 60,
          lifetimeAgreements: 57,
          windowSamples: 10,
          windowAgreements: 9,
        },
      ],
    );

    const report = await service.getCategoryAccuracy();

    expect(report.categories).toHaveLength(1);
    const [news] = report.categories;
    expect(news.category).toBe("Newsletters");
    expect(news.sampleRatePercent).toBe(10);
    expect(news.lifetimeSamples).toBe(100);
    expect(news.lifetimeAgreements).toBe(87);
    expect(news.agreementPct).toBe(87);
    expect(news.windowSamples).toBe(15);
    expect(news.windowAgreements).toBe(13);
  });

  it("sorts categories by lifetime samples desc and totals overall", async () => {
    const service = await buildWith(
      [],
      [
        {
          userId: "user-a",
          categoryHash: "hash-a",
          category: "Small",
          sampleRatePercent: 50,
          lifetimeSamples: 20,
          lifetimeAgreements: 10,
          windowSamples: 0,
          windowAgreements: 0,
        },
        {
          userId: "user-a",
          categoryHash: "hash-b",
          category: "Big",
          sampleRatePercent: 10,
          lifetimeSamples: 80,
          lifetimeAgreements: 72,
          windowSamples: 0,
          windowAgreements: 0,
        },
      ],
    );

    const report = await service.getCategoryAccuracy();

    expect(report.categories.map((row) => row.category)).toEqual([
      "Big",
      "Small",
    ]);
    expect(report.overall).toEqual({
      samples: 100,
      agreements: 82,
      agreementPct: 82,
    });
  });

  it("returns 0 agreement for a category with no lifetime samples", async () => {
    const service = await buildWith(
      [],
      [
        {
          userId: "user-a",
          categoryHash: "hash-x",
          category: "Empty",
          sampleRatePercent: 50,
          lifetimeSamples: 0,
          lifetimeAgreements: 0,
          windowSamples: 0,
          windowAgreements: 0,
        },
      ],
    );

    const report = await service.getCategoryAccuracy();

    expect(report.categories[0].agreementPct).toBe(0);
  });

  it("returns empty categories and zeroed overall for an empty table", async () => {
    const service = await buildWith([], []);

    const report = await service.getCategoryAccuracy();

    expect(report.categories).toEqual([]);
    expect(report.overall).toEqual({
      samples: 0,
      agreements: 0,
      agreementPct: 0,
    });
  });
});
