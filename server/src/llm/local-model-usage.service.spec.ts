import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelUsageService } from "./local-model-usage.service";

/**
 * The query builder is called twice (prioritySource, then categorySource); each
 * `getRawMany` returns the next queued result set.
 */
type SourceRow = { source: string | null; count: string };

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

async function build(resultSets: SourceRow[][]) {
  const repo = makeRepo(resultSets);
  const moduleRef = await Test.createTestingModule({
    providers: [
      LocalModelUsageService,
      { provide: getRepositoryToken(EmailThread), useValue: repo },
    ],
  }).compile();
  return moduleRef.get(LocalModelUsageService);
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
      total: 100,
      localPct: 40,
    });
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
