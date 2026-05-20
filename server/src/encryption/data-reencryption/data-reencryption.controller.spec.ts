import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AdminGuard } from "../../auth/admin.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { User } from "../../database/entities/user.entity";
import { JobPriority } from "../../queue/job-priorities";
import { DataReencryptionController } from "./data-reencryption.controller";
import { DataReencryptionService } from "./data-reencryption.service";

describe("DataReencryptionController", () => {
  let controller: DataReencryptionController;
  let bossSend: jest.Mock;
  let bossGetJobById: jest.Mock;
  let reencryptUser: jest.Mock;
  let userQueryBuilder: jest.Mock;

  beforeEach(async () => {
    bossSend = jest.fn().mockResolvedValue("job-uuid-123");
    bossGetJobById = jest.fn();
    reencryptUser = jest.fn();
    userQueryBuilder = jest.fn();

    const moduleRef = await Test.createTestingModule({
      controllers: [DataReencryptionController],
      providers: [
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: { send: bossSend, getJobById: bossGetJobById },
        },
        {
          provide: DataReencryptionService,
          useValue: { reencryptUser, getTables: () => [] },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn().mockResolvedValue(0),
            createQueryBuilder: userQueryBuilder,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(DataReencryptionController);
  });

  describe("dryRunSelf", () => {
    it("enqueues a job for the calling user and returns the job id", async () => {
      const response = await controller.dryRunSelf({
        user: { userId: "user-1" },
      });

      expect(bossSend).toHaveBeenCalledWith(
        JOB_NAMES.REENCRYPT_USER_DATA,
        { userId: "user-1", dryRun: true },
        { priority: JobPriority.HIGH },
      );
      expect(response).toEqual({
        jobId: "job-uuid-123",
        userId: "user-1",
        dryRun: true,
      });
    });

    it("does not run the re-encryption synchronously", async () => {
      await controller.dryRunSelf({ user: { userId: "user-1" } });
      expect(reencryptUser).not.toHaveBeenCalled();
    });

    it("throws when the request has no user id", async () => {
      await expect(controller.dryRunSelf({ user: {} })).rejects.toThrow(
        /current user/i,
      );
    });
  });

  describe("startAll", () => {
    it("enqueues the fan-out meta-job and does NOT touch the user repo", async () => {
      const response = await controller.startAll({ dryRun: true });

      expect(bossSend).toHaveBeenCalledWith(
        JOB_NAMES.REENCRYPT_FANOUT_ALL,
        { dryRun: true },
        { priority: JobPriority.MEDIUM },
      );
      // The previous synchronous version iterated all users inside the
      // request via createQueryBuilder — that's exactly what we moved into
      // the worker, so the controller must no longer call it.
      expect(userQueryBuilder).not.toHaveBeenCalled();
      expect(response).toEqual({ jobId: "job-uuid-123", dryRun: true });
    });

    it("defaults dryRun to false when omitted", async () => {
      const response = await controller.startAll();

      expect(bossSend).toHaveBeenCalledWith(
        JOB_NAMES.REENCRYPT_FANOUT_ALL,
        { dryRun: false },
        { priority: JobPriority.MEDIUM },
      );
      expect(response.dryRun).toBe(false);
    });
  });

  describe("startOne", () => {
    it("enqueues a single per-user job and returns the job id", async () => {
      const response = await controller.startOne({
        userId: "user-7",
        dryRun: false,
      });

      expect(bossSend).toHaveBeenCalledWith(
        JOB_NAMES.REENCRYPT_USER_DATA,
        { userId: "user-7", dryRun: false },
        { priority: JobPriority.VERY_LOW },
      );
      expect(response).toEqual({
        jobId: "job-uuid-123",
        userId: "user-7",
        dryRun: false,
      });
      expect(reencryptUser).not.toHaveBeenCalled();
    });
  });

  describe("getJob", () => {
    it("returns completed state with the persisted result", async () => {
      const result = {
        userId: "user-1",
        dryRun: true,
        tables: [
          {
            table: "emails",
            rowsScanned: 10,
            rowsRewritten: 0,
            rowsAlreadyMigrated: 10,
            rowsFailed: 0,
          },
        ],
      };
      const createdOn = new Date("2026-05-11T10:00:00Z");
      const completedOn = new Date("2026-05-11T10:00:30Z");
      // PgBoss exposes timestamps as lowercase keys on JobWithMetadata
      // (`createdon` / `completedon`) — matches the raw pg column names. The
      // controller normalises to camelCase for the response payload.
      bossGetJobById.mockResolvedValue({
        state: "completed",
        output: result,
        createdon: createdOn,
        completedon: completedOn,
      });

      const response = await controller.getJob("job-uuid-123");

      expect(bossGetJobById).toHaveBeenCalledWith("job-uuid-123");
      expect(response.state).toBe("completed");
      expect(response.output).toEqual(result);
      expect(response.createdOn).toBe(createdOn);
      expect(response.completedOn).toBe(completedOn);
    });

    it("returns not_found when PgBoss has no record (archived/pruned)", async () => {
      bossGetJobById.mockResolvedValue(null);

      const response = await controller.getJob("missing");

      expect(response).toEqual({ state: "not_found", output: null });
    });

    it("returns null output while the job is still active", async () => {
      const createdOn = new Date("2026-05-11T10:00:00Z");
      bossGetJobById.mockResolvedValue({
        state: "active",
        output: null,
        createdon: createdOn,
        completedon: null,
      });

      const response = await controller.getJob("job-uuid-123");

      expect(response.state).toBe("active");
      expect(response.output).toBeNull();
      expect(response.createdOn).toBe(createdOn);
      expect(response.completedOn).toBeNull();
    });
  });

  describe("getFanoutResults", () => {
    it("returns not_found when the fan-out job has been pruned", async () => {
      bossGetJobById.mockResolvedValue(null);

      const response = await controller.getFanoutResults("missing");

      expect(response.state).toBe("not_found");
      expect(response.childrenTotal).toBe(0);
      expect(response.children).toEqual([]);
      expect(response.failures).toEqual([]);
      expect(response.childJobErrors).toEqual([]);
    });

    it("aggregates per-table totals + attaches userId to each failure", async () => {
      // Fan-out enqueued two children. One completed cleanly, one completed
      // with row-level failures.
      bossGetJobById.mockImplementation((id: string) => {
        if (id === "fanout-1") {
          return Promise.resolve({
            state: "completed",
            output: {
              enqueued: 2,
              dryRun: true,
              childJobIds: ["child-clean", "child-with-failures"],
            },
          });
        }
        if (id === "child-clean") {
          return Promise.resolve({
            state: "completed",
            data: { userId: "user-a", dryRun: true },
            output: {
              userId: "user-a",
              dryRun: true,
              tables: [
                {
                  table: "emails",
                  rowsScanned: 100,
                  rowsRewritten: 80,
                  rowsAlreadyMigrated: 20,
                  rowsFailed: 0,
                  failures: [],
                },
              ],
            },
          });
        }
        if (id === "child-with-failures") {
          return Promise.resolve({
            state: "completed",
            data: { userId: "user-b", dryRun: true },
            output: {
              userId: "user-b",
              dryRun: true,
              tables: [
                {
                  table: "emails",
                  rowsScanned: 50,
                  rowsRewritten: 47,
                  rowsAlreadyMigrated: 0,
                  rowsFailed: 3,
                  failures: [
                    {
                      table: "emails",
                      rowId: "email-1",
                      column: "subject",
                      reason: "neither_key",
                      ivHexLen: 32,
                      tagHexLen: 32,
                      bodyHexLen: 40,
                      totalLen: 106,
                      prefix: "deadbeef0011",
                      suffix: "aabbccddeeff",
                      errorMessage:
                        "decrypts under neither user nor global key",
                    },
                  ],
                },
              ],
            },
          });
        }
        return Promise.resolve(null);
      });

      const response = await controller.getFanoutResults("fanout-1");

      expect(response.state).toBe("completed");
      expect(response.childrenTotal).toBe(2);
      expect(response.childrenTerminal).toBe(2);
      expect(response.childrenCompleted).toBe(2);
      expect(response.childrenFailed).toBe(0);
      expect(response.usersWithRowFailures).toBe(1);
      expect(response.tables).toEqual([
        {
          table: "emails",
          rowsScanned: 150,
          rowsRewritten: 127,
          rowsAlreadyMigrated: 20,
          rowsFailed: 3,
        },
      ]);
      expect(response.failures).toHaveLength(1);
      // Owning user is attached server-side so the admin UI doesn't have to
      // cross-reference children and failures itself.
      expect(response.failures[0].userId).toBe("user-b");
      expect(response.failures[0].column).toBe("subject");
      expect(response.failures[0].reason).toBe("neither_key");
      // No job-level failures — both children completed successfully.
      expect(response.childJobErrors).toEqual([]);
    });

    it("does not crash when a failed child's output is a PgBoss error payload (no `tables` field)", async () => {
      // Regression: PgBoss persists thrown errors as the job's `output`, so a
      // FAILED child has e.g. `{ message: "boom" }` rather than a
      // UserReencryptionResult. Iterating `out.tables` on that shape used to
      // throw "TypeError: out.tables is not iterable" and return HTTP 500.
      bossGetJobById.mockImplementation((id: string) => {
        if (id === "fanout-mixed") {
          return Promise.resolve({
            state: "completed",
            output: {
              enqueued: 2,
              dryRun: false,
              childJobIds: ["child-ok", "child-failed"],
            },
          });
        }
        if (id === "child-ok") {
          return Promise.resolve({
            state: "completed",
            data: { userId: "user-a", dryRun: false },
            output: {
              userId: "user-a",
              dryRun: false,
              tables: [
                {
                  table: "emails",
                  rowsScanned: 10,
                  rowsRewritten: 10,
                  rowsAlreadyMigrated: 0,
                  rowsFailed: 0,
                  failures: [],
                },
              ],
            },
          });
        }
        if (id === "child-failed") {
          return Promise.resolve({
            state: "failed",
            data: { userId: "user-b", dryRun: false },
            output: { message: "boom: rds connection reset" },
          });
        }
        return Promise.resolve(null);
      });

      const response = await controller.getFanoutResults("fanout-mixed");

      expect(response.childrenTotal).toBe(2);
      expect(response.childrenCompleted).toBe(1);
      expect(response.childrenFailed).toBe(1);
      expect(response.childrenTerminal).toBe(2);
      expect(response.tables).toEqual([
        {
          table: "emails",
          rowsScanned: 10,
          rowsRewritten: 10,
          rowsAlreadyMigrated: 0,
          rowsFailed: 0,
        },
      ]);
      expect(response.failures).toEqual([]);
      // The error message from the PgBoss error payload must be surfaced so
      // admins can see WHY a child job failed rather than just a count.
      expect(response.childJobErrors).toEqual([
        {
          jobId: "child-failed",
          userId: "user-b",
          message: "boom: rds connection reset",
        },
      ]);
    });

    it("does not crash when a completed child output omits the `tables` field", async () => {
      // Belt-and-braces for shape drift: even if a future code path returns a
      // partial result on the COMPLETED path, aggregation should skip it
      // rather than throw.
      bossGetJobById.mockImplementation((id: string) => {
        if (id === "fanout-partial") {
          return Promise.resolve({
            state: "completed",
            output: {
              enqueued: 1,
              dryRun: false,
              childJobIds: ["child-malformed"],
            },
          });
        }
        if (id === "child-malformed") {
          return Promise.resolve({
            state: "completed",
            data: { userId: "user-c", dryRun: false },
            output: { userId: "user-c", dryRun: false },
          });
        }
        return Promise.resolve(null);
      });

      const response = await controller.getFanoutResults("fanout-partial");

      expect(response.childrenCompleted).toBe(1);
      expect(response.tables).toEqual([]);
      expect(response.failures).toEqual([]);
    });

    it("counts in-progress children but reports them as not-yet-terminal", async () => {
      bossGetJobById.mockImplementation((id: string) => {
        if (id === "fanout-running") {
          return Promise.resolve({
            state: "completed",
            output: {
              enqueued: 2,
              dryRun: true,
              childJobIds: ["child-active", "child-done"],
            },
          });
        }
        if (id === "child-active") {
          return Promise.resolve({
            state: "active",
            data: { userId: "user-a", dryRun: true },
            output: null,
          });
        }
        if (id === "child-done") {
          return Promise.resolve({
            state: "completed",
            data: { userId: "user-b", dryRun: true },
            output: {
              userId: "user-b",
              dryRun: true,
              tables: [],
            },
          });
        }
        return Promise.resolve(null);
      });

      const response = await controller.getFanoutResults("fanout-running");

      expect(response.childrenTotal).toBe(2);
      expect(response.childrenTerminal).toBe(1);
      expect(response.childrenCompleted).toBe(1);
    });
  });
});
