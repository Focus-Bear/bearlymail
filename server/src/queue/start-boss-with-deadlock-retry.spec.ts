import { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { startBossWithDeadlockRetry } from "./start-boss-with-deadlock-retry";

function makeLogger() {
  return {
    warn: jest.fn(),
  } as unknown as Logger;
}

function deadlockError() {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

describe("startBossWithDeadlockRetry", () => {
  beforeAll(() => {
    // Make retry backoff instantaneous.
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("returns immediately when boss.start succeeds first try", async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const boss = { start } as unknown as PgBoss;

    await startBossWithDeadlockRetry(boss, makeLogger());

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("retries on a Postgres deadlock (40P01) and succeeds on a later attempt", async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce(deadlockError())
      .mockResolvedValueOnce(undefined);
    const logger = makeLogger();
    const boss = { start } as unknown as PgBoss;

    await startBossWithDeadlockRetry(boss, logger);

    expect(start).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("identifies deadlocks by message text when the code field is missing", async () => {
    // pg-boss occasionally wraps the underlying pg error and drops fields,
    // so we fall back to message matching.
    const messageOnly = new Error(
      "Migration failed: deadlock detected on pgboss.version",
    );
    const start = jest
      .fn()
      .mockRejectedValueOnce(messageOnly)
      .mockResolvedValueOnce(undefined);
    const boss = { start } as unknown as PgBoss;

    await startBossWithDeadlockRetry(boss, makeLogger());

    expect(start).toHaveBeenCalledTimes(2);
  });

  it("identifies deadlocks when the rejection is a bare string", async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce("deadlock detected")
      .mockResolvedValueOnce(undefined);
    const boss = { start } as unknown as PgBoss;

    await startBossWithDeadlockRetry(boss, makeLogger());

    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry non-deadlock errors — they bubble up immediately", async () => {
    const authError = Object.assign(
      new Error("password authentication failed"),
      {
        code: "28P01",
      },
    );
    const start = jest.fn().mockRejectedValue(authError);
    const boss = { start } as unknown as PgBoss;

    await expect(startBossWithDeadlockRetry(boss, makeLogger())).rejects.toBe(
      authError,
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_ATTEMPTS deadlocks and rethrows the last one", async () => {
    const err = deadlockError();
    const start = jest.fn().mockRejectedValue(err);
    const boss = { start } as unknown as PgBoss;

    await expect(startBossWithDeadlockRetry(boss, makeLogger())).rejects.toBe(
      err,
    );
    expect(start).toHaveBeenCalledTimes(3);
  });
});
