import type { DataSource } from "typeorm";

import {
  createAdvisoryApplySerialiser,
  markRunBatchComplete,
} from "./priority-run-store";

function makeDataSource() {
  const calls: string[] = [];
  const queryRunner = {
    connect: jest.fn(async () => calls.push("connect")),
    query: jest.fn(async (sql: string) =>
      calls.push(sql.includes("unlock") ? "unlock" : "lock"),
    ),
    release: jest.fn(async () => calls.push("release")),
  };
  const dataSource = {
    createQueryRunner: () => queryRunner,
    query: jest.fn(),
  } as unknown as DataSource;
  return { dataSource, queryRunner, calls };
}

describe("createAdvisoryApplySerialiser", () => {
  it("holds a per-user advisory lock around the work", async () => {
    const { dataSource, queryRunner, calls } = makeDataSource();
    const serialise = createAdvisoryApplySerialiser(dataSource);

    const result = await serialise("user-1", async () => {
      calls.push("work");
      return "applied";
    });

    expect(result).toBe("applied");
    expect(calls).toEqual(["connect", "lock", "work", "unlock", "release"]);
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_lock"),
      ["priority-apply:user-1"],
    );
  });

  it("unlocks and releases the connection when the work throws", async () => {
    const { dataSource, calls } = makeDataSource();
    const serialise = createAdvisoryApplySerialiser(dataSource);

    await expect(
      serialise("user-1", async () => {
        throw new Error("apply failed");
      }),
    ).rejects.toThrow("apply failed");
    expect(calls).toEqual(["connect", "lock", "unlock", "release"]);
  });
});

describe("markRunBatchComplete", () => {
  it("increments the run's completed batches in a single statement", async () => {
    const { dataSource } = makeDataSource();
    await markRunBatchComplete(dataSource, "analysis-1");
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /"completedBatches" = "completedBatches" \+ 1[\s\S]*'completed'/,
      ),
      ["analysis-1"],
    );
  });
});
