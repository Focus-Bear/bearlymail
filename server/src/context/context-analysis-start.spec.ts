import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";
import { ContextSqsDispatchService } from "./context-sqs-dispatch.service";

describe("ContextAnalysisProgressService.startAnalysis", () => {
  let service: ContextAnalysisProgressService;
  let repository: {
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let boss: { send: jest.Mock };

  beforeEach(async () => {
    repository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn().mockImplementation((record) => ({
        ...record,
        id: "analysis-1",
      })),
      save: jest.fn().mockImplementation((record) => Promise.resolve(record)),
    };
    boss = { send: jest.fn().mockResolvedValue("job-1") };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextAnalysisProgressService,
        {
          provide: getRepositoryToken(ContextAnalysis),
          useValue: repository,
        },
        { provide: ContextSqsDispatchService, useValue: {} },
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
      ],
    }).compile();
    service = module.get(ContextAnalysisProgressService);
  });

  it("supersedes any still-running analysis so stale insights never show", async () => {
    await service.startAnalysis("user-1");

    expect(repository.update).toHaveBeenCalledWith(
      { userId: "user-1", status: "running" },
      { status: "failed", errorMessage: "Superseded by new analysis" },
    );
  });

  it("creates the new record with EMPTY stats (no batch results from prior runs)", async () => {
    await service.startAnalysis("user-1");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: "running",
        progress: 0,
        stats: expect.objectContaining({
          batchResults: {},
          batchJobIds: {},
          batchPayloadsForRetry: {},
        }),
      }),
    );
    expect(repository.save).toHaveBeenCalled();
  });

  it("marks the record failed and rethrows when the enqueue fails (no stranded 'running' rows)", async () => {
    boss.send.mockRejectedValue(new Error("pgboss down"));

    await expect(service.startAnalysis("user-1")).rejects.toThrow(
      "pgboss down",
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: "analysis-1" },
      { status: "failed", errorMessage: "Failed to enqueue analysis job" },
    );
  });

  it("enqueues the ANALYZE_CONTEXT job and returns the analysis id", async () => {
    const result = await service.startAnalysis("user-1");

    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.ANALYZE_CONTEXT,
      { userId: "user-1", analysisId: "analysis-1" },
      expect.objectContaining({ priority: expect.any(Number) }),
    );
    expect(result).toEqual({ analysisId: "analysis-1" });
  });
});
