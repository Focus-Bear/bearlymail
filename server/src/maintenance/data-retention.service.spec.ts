import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { DataRetentionService } from "./data-retention.service";

const DAY_MS = 86_400_000;

describe("DataRetentionService", () => {
  let service: DataRetentionService;
  let query: jest.Mock;

  beforeEach(async () => {
    // 0 rows returned → each table completes in a single batch.
    query = jest.fn().mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        DataRetentionService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: {} },
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = module.get(DataRetentionService);
  });

  const sqlFor = (table: string) =>
    query.mock.calls.find((call) => (call[0] as string).includes(`"${table}"`));

  it("prunes every configured table", async () => {
    await service.pruneAll();
    for (const table of [
      "token_usage",
      "debug_data",
      "auto_response_logs",
      "sync_history_logs",
      "prompt_examples",
    ]) {
      expect(sqlFor(table)).toBeDefined();
    }
  });

  it("uses a 30-day cutoff for token_usage and 14-day for debug_data", async () => {
    const before = Date.now();
    await service.pruneAll();
    const tokenCutoff = (sqlFor("token_usage")![1][0] as Date).getTime();
    const debugCutoff = (sqlFor("debug_data")![1][0] as Date).getTime();
    expect(before - tokenCutoff).toBeGreaterThan(29 * DAY_MS);
    expect(before - tokenCutoff).toBeLessThan(31 * DAY_MS);
    expect(before - debugCutoff).toBeGreaterThan(13 * DAY_MS);
    expect(before - debugCutoff).toBeLessThan(15 * DAY_MS);
  });

  it("keeps batching while a full batch is returned, then stops", async () => {
    const fullBatch = new Array(5000).fill(1);
    // token_usage: two full batches, then a short one; remaining tables empty.
    query
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([1])
      .mockResolvedValue([]);
    await service.pruneAll();
    // 3 calls for token_usage + 1 each for the other 4 tables.
    expect(query).toHaveBeenCalledTimes(7);
  });

  it("isolates a failing table and still prunes the rest", async () => {
    query.mockRejectedValueOnce(new Error("boom")).mockResolvedValue([]);
    await expect(service.pruneAll()).rejects.toThrow(
      "Data-retention sweep failed",
    );
    expect(query).toHaveBeenCalledTimes(5);
  });
});
