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
});
