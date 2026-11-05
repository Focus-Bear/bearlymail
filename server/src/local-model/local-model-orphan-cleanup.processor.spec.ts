import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { JOB_NAMES } from "../constants/job-names";
import { UsersService } from "../users/users.service";
import { LocalModelOrphanCleanupProcessor } from "./local-model-orphan-cleanup.processor";
import { LocalModelUserDataService } from "./local-model-user-data.service";

jest.mock("../utils/error-logger", () => ({ logErrorToFile: jest.fn() }));

const LIVE_USER = "11111111-1111-1111-1111-111111111111";
const DELETED_USER = "22222222-2222-2222-2222-222222222222";
const OTHER_DELETED_USER = "33333333-3333-3333-3333-333333333333";

function build(env: Record<string, string>, storedIds: string[]) {
  const boss = {
    schedule: jest.fn().mockResolvedValue(undefined),
    work: jest.fn().mockResolvedValue("worker-id"),
    send: jest.fn().mockResolvedValue("job-id"),
  };
  const usersService = {
    findExistingUserIds: jest.fn().mockResolvedValue(new Set([LIVE_USER])),
  };
  const userDataService = {
    findStoredUserIds: jest.fn().mockResolvedValue(storedIds),
    deleteUserData: jest.fn().mockResolvedValue(3),
  };
  const processor = new LocalModelOrphanCleanupProcessor(
    boss as unknown as PgBoss,
    { get: (key: string) => env[key] } as unknown as ConfigService,
    usersService as unknown as UsersService,
    userDataService as unknown as LocalModelUserDataService,
  );
  return { boss, usersService, userDataService, processor };
}

const DELETE_ON = { LOCAL_MODEL_ORPHAN_CLEANUP_DELETE: "true" };

describe("LocalModelOrphanCleanupProcessor", () => {
  it("stays off on the web task, which has no LOCAL_MODELS_BUCKET", async () => {
    const { boss, processor } = build(
      { LOCAL_MODELS_CLEANUP_BUCKET: "bucket" },
      [],
    );

    await processor.onModuleInit();

    expect(boss.schedule).not.toHaveBeenCalled();
    expect(boss.work).not.toHaveBeenCalled();
  });

  it("schedules the job on the worker and runs it once after a deploy", async () => {
    const { boss, processor } = build({ LOCAL_MODELS_BUCKET: "bucket" }, []);

    await processor.onModuleInit();

    const job = JOB_NAMES.CLEANUP_ORPHANED_LOCAL_MODEL_DATA;
    expect(boss.schedule).toHaveBeenCalledWith(job, "0 4 * * *");
    expect(boss.work).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith(
      job,
      {},
      expect.objectContaining({ singletonSeconds: expect.any(Number) }),
    );
  });

  it("only reports by default, and deletes nothing", async () => {
    const { userDataService, processor } = build({}, [LIVE_USER, DELETED_USER]);

    await expect(processor.handleCleanup()).resolves.toEqual({
      storedUsers: 2,
      orphaned: 1,
      deleted: 0,
      failed: 0,
      dryRun: true,
    });
    expect(userDataService.deleteUserData).not.toHaveBeenCalled();
  });

  it("treats any value but 'true' as a dry run", async () => {
    const { userDataService, processor } = build(
      { LOCAL_MODEL_ORPHAN_CLEANUP_DELETE: "yes" },
      [DELETED_USER, LIVE_USER],
    );

    await processor.handleCleanup();

    expect(userDataService.deleteUserData).not.toHaveBeenCalled();
  });

  it("deletes only users without an account once switched on", async () => {
    const { userDataService, processor } = build(DELETE_ON, [
      LIVE_USER,
      DELETED_USER,
      OTHER_DELETED_USER,
    ]);

    const result = await processor.handleCleanup();

    expect(result).toMatchObject({ orphaned: 2, deleted: 2, dryRun: false });
    expect(userDataService.deleteUserData.mock.calls.flat()).toEqual([
      DELETED_USER,
      OTHER_DELETED_USER,
    ]);
  });

  it("deletes nothing if the lookup finds no accounts at all", async () => {
    const { usersService, userDataService, processor } = build(DELETE_ON, [
      LIVE_USER,
      DELETED_USER,
    ]);
    usersService.findExistingUserIds.mockResolvedValue(new Set());

    const result = await processor.handleCleanup();

    expect(result).toMatchObject({ orphaned: 0, deleted: 0 });
    expect(userDataService.deleteUserData).not.toHaveBeenCalled();
  });

  it("carries on after one user's delete fails", async () => {
    const { userDataService, processor } = build(DELETE_ON, [
      LIVE_USER,
      DELETED_USER,
      OTHER_DELETED_USER,
    ]);
    userDataService.deleteUserData.mockRejectedValueOnce(new Error("S3 down"));

    const result = await processor.handleCleanup();

    expect(result).toMatchObject({ deleted: 1, failed: 1 });
    expect(userDataService.deleteUserData).toHaveBeenCalledTimes(2);
  });

  it("stops at the per-run limit and leaves the rest for the next run", async () => {
    const orphans = Array.from(
      { length: 501 },
      (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    );
    const { userDataService, processor } = build(DELETE_ON, [
      LIVE_USER,
      ...orphans,
    ]);

    const result = await processor.handleCleanup();

    expect(result).toMatchObject({ orphaned: 501, deleted: 500 });
    expect(userDataService.deleteUserData).toHaveBeenCalledTimes(500);
  });
});
