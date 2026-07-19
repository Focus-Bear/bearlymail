import type { PgBoss } from "pg-boss";

import { JOB_NAMES } from "../constants/job-names";
import { DebugService } from "./debug.service";
import { DebugCleanupService } from "./debug-cleanup.service";

jest.mock("../queue/register-worker", () => ({
  registerWorker: jest.fn().mockResolvedValue(undefined),
}));

describe("DebugCleanupService", () => {
  it("schedules and registers using JOB_NAMES.DEBUG_DATA_CLEANUP", async () => {
    // Regression guard for the pg-boss v10 boot loop: the queue.module.ts
    // `createQueue()` loop only iterates JOB_NAMES, so any queue name used by
    // schedule()/work() that ISN'T listed there produces a runtime
    // "Queue debug-data-cleanup not found" error every cleanup tick.
    expect(JOB_NAMES.DEBUG_DATA_CLEANUP).toBe("debug-data-cleanup");

    const schedule = jest.fn().mockResolvedValue(undefined);
    const boss = { schedule } as unknown as PgBoss;
    const debugService = {
      cleanupExpiredData: jest.fn(),
    } as unknown as DebugService;

    const service = new DebugCleanupService(boss, debugService);
    await service.onModuleInit();

    expect(schedule).toHaveBeenCalledWith(
      JOB_NAMES.DEBUG_DATA_CLEANUP,
      expect.any(String),
      expect.any(Object),
    );
    const { registerWorker } = jest.requireMock<{
      registerWorker: jest.Mock;
    }>("../queue/register-worker");
    expect(registerWorker).toHaveBeenCalledWith(
      boss,
      JOB_NAMES.DEBUG_DATA_CLEANUP,
      expect.any(Function),
    );
  });
});
