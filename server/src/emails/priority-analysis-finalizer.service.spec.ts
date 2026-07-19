import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityAnalysisRun } from "../database/entities/priority-analysis-run.entity";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";

function makeRun(
  overrides: Partial<PriorityAnalysisRun> = {},
): PriorityAnalysisRun {
  const run = new PriorityAnalysisRun();
  run.id = "analysis-abc";
  run.userId = "user-1";
  run.status = "running";
  run.totalBatches = 1;
  run.completedBatches = 0;
  run.threadIds = ["thread-1", "thread-2"];
  // 10 minutes ago
  run.createdAt = new Date(Date.now() - 10 * 60 * 1000);
  run.updatedAt = new Date();
  return Object.assign(run, overrides);
}

describe("PriorityAnalysisFinalizerService", () => {
  let service: PriorityAnalysisFinalizerService;
  let mockRunRepo: jest.Mocked<Repository<PriorityAnalysisRun>>;
  let mockThreadRepo: jest.Mocked<Repository<EmailThread>>;
  let mockBoss: jest.Mocked<Pick<PgBoss, "schedule" | "work">>;

  beforeEach(async () => {
    mockRunRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<PriorityAnalysisRun>>;

    mockThreadRepo = {
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    mockBoss = {
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriorityAnalysisFinalizerService,
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: mockBoss,
        },
        {
          provide: getRepositoryToken(PriorityAnalysisRun),
          useValue: mockRunRepo,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockThreadRepo,
        },
      ],
    }).compile();

    service = module.get<PriorityAnalysisFinalizerService>(
      PriorityAnalysisFinalizerService,
    );
  });

  describe("onModuleInit", () => {
    it("registers the PgBoss schedule and worker", async () => {
      await service.onModuleInit();
      expect(mockBoss.schedule).toHaveBeenCalledWith(
        JOB_NAMES.FINALIZE_STALLED_PRIORITY_RUNS,
        expect.any(String),
      );
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_NAMES.FINALIZE_STALLED_PRIORITY_RUNS,
        { batchSize: 1 },
        expect.any(Function),
      );
    });
  });

  describe("createRun", () => {
    it("persists a new PriorityAnalysisRun record", async () => {
      const run = makeRun();
      mockRunRepo.create.mockReturnValue(run);
      mockRunRepo.save.mockResolvedValue(run);

      await service.createRun({
        analysisId: "analysis-abc",
        userId: "user-1",
        totalBatches: 1,
        threadIds: ["thread-1", "thread-2"],
      });

      expect(mockRunRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "analysis-abc",
          userId: "user-1",
          totalBatches: 1,
          completedBatches: 0,
          status: "running",
          threadIds: ["thread-1", "thread-2"],
        }),
      );
      expect(mockRunRepo.save).toHaveBeenCalledWith(run);
    });
  });

  describe("detectAndFinalizeStalledRuns", () => {
    it("does nothing when there are no stalled runs", async () => {
      mockRunRepo.find.mockResolvedValue([]);

      await service.detectAndFinalizeStalledRuns();

      expect(mockThreadRepo.update).not.toHaveBeenCalled();
      expect(mockRunRepo.update).not.toHaveBeenCalled();
    });

    it("unlocks threads and marks run as failed for a stalled run", async () => {
      const run = makeRun();
      mockRunRepo.find.mockResolvedValue([run]);
      mockThreadRepo.update.mockResolvedValue({ affected: 2 } as never);
      mockRunRepo.update.mockResolvedValue({ affected: 1 } as never);

      await service.detectAndFinalizeStalledRuns();

      expect(mockThreadRepo.update).toHaveBeenCalledWith(
        { id: expect.anything(), isProcessingPriority: true },
        { isProcessingPriority: false },
      );
      expect(mockRunRepo.update).toHaveBeenCalledWith(
        { id: run.id },
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("skips thread unlock for runs with null threadIds", async () => {
      const run = makeRun({ threadIds: null });
      mockRunRepo.find.mockResolvedValue([run]);
      mockRunRepo.update.mockResolvedValue({ affected: 1 } as never);

      await service.detectAndFinalizeStalledRuns();

      expect(mockThreadRepo.update).not.toHaveBeenCalled();
      expect(mockRunRepo.update).toHaveBeenCalledWith(
        { id: run.id },
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("continues finalizing subsequent runs even if one thread unlock fails", async () => {
      const run1 = makeRun({ id: "run-1", threadIds: ["thread-1"] });
      const run2 = makeRun({ id: "run-2", threadIds: ["thread-2"] });
      mockRunRepo.find.mockResolvedValue([run1, run2]);
      mockThreadRepo.update
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValue({ affected: 1 } as never);
      mockRunRepo.update.mockResolvedValue({ affected: 1 } as never);

      await service.detectAndFinalizeStalledRuns();

      // Both runs should be marked failed (update called twice)
      expect(mockRunRepo.update).toHaveBeenCalledTimes(2);
    });
  });
});
