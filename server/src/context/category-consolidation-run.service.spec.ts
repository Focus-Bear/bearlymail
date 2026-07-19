import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { CategoryConsolidationRun } from "../database/entities/category-consolidation-run.entity";
import {
  CategoryConsolidationService,
  ConsolidationResult,
} from "./category-consolidation.service";
import { CategoryConsolidationRunService } from "./category-consolidation-run.service";

describe("CategoryConsolidationRunService", () => {
  let service: CategoryConsolidationRunService;
  let runRepo: jest.Mocked<Repository<CategoryConsolidationRun>>;
  let boss: { send: jest.Mock };
  let consolidation: { consolidate: jest.Mock };

  const sampleResult: ConsolidationResult = {
    originalCount: 9,
    consolidatedCount: 5,
    userAddedCount: 2,
    mergedGroups: [
      {
        survivor: "📱 App Store Notifications",
        merged: ["🚀 App Store Notifications"],
        family: "(exact name)",
        threadsReassigned: 3,
        method: "exact-name",
      },
      {
        survivor: "🔧 GitHub PR Updates",
        merged: ["Pull Request Updates"],
        family: "(cross-family)",
        threadsReassigned: 6,
        method: "semantic",
      },
    ],
    prunedCategories: [{ name: "🗑 Dead", reason: "never-used" }],
    categories: [],
  };

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-1") };
    consolidation = { consolidate: jest.fn().mockResolvedValue(sampleResult) };
    runRepo = {
      create: jest.fn((value) => value),
      save: jest
        .fn()
        .mockResolvedValue({ id: "run-1", userId: "u1", status: "pending" }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<CategoryConsolidationRun>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryConsolidationRunService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        {
          provide: getRepositoryToken(CategoryConsolidationRun),
          useValue: runRepo,
        },
        { provide: CategoryConsolidationService, useValue: consolidation },
      ],
    }).compile();

    service = module.get(CategoryConsolidationRunService);
  });

  it("enqueue creates a pending run and sends the job", async () => {
    const { runId, status } = await service.enqueue("u1");

    expect(runId).toBe("run-1");
    expect(status).toBe("pending");
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.CONSOLIDATE_CATEGORIES,
      { userId: "u1", runId: "run-1" },
      expect.objectContaining({
        singletonKey: "consolidate-categories-u1",
      }),
    );
  });

  it("reuses the in-flight run and drops the orphan when the job is deduped", async () => {
    boss.send.mockResolvedValueOnce(null);
    runRepo.findOne = jest
      .fn()
      .mockResolvedValue({ id: "run-existing", status: "running" });

    const { runId, status } = await service.enqueue("u1");

    expect(runId).toBe("run-existing");
    expect(status).toBe("running");
    expect(runRepo.delete).toHaveBeenCalledWith("run-1");
  });

  it("throws when the job is deduped but no in-flight run remains", async () => {
    boss.send.mockResolvedValueOnce(null);
    runRepo.findOne = jest.fn().mockResolvedValue(null);

    await expect(service.enqueue("u1")).rejects.toThrow(ConflictException);
    expect(runRepo.delete).toHaveBeenCalledWith("run-1");
  });

  it("execute marks the run running, then completed with a mapped summary", async () => {
    await service.execute("run-1", "u1");

    expect(runRepo.update).toHaveBeenCalledWith("run-1", { status: "running" });
    expect(runRepo.update).toHaveBeenCalledWith("run-1", {
      status: "completed",
      error: null,
      result: {
        originalCount: 9,
        consolidatedCount: 5,
        mergedCount: 2,
        prunedCount: 1,
        mergedGroups: [
          {
            survivor: "📱 App Store Notifications",
            merged: ["🚀 App Store Notifications"],
            family: "(exact name)",
            method: "exact-name",
          },
          {
            survivor: "🔧 GitHub PR Updates",
            merged: ["Pull Request Updates"],
            family: "(cross-family)",
            method: "semantic",
          },
        ],
        prunedCategories: [{ name: "🗑 Dead", reason: "never-used" }],
      },
    });
  });

  it("execute marks the run failed and re-throws on error", async () => {
    consolidation.consolidate.mockRejectedValueOnce(new Error("LLM down"));

    await expect(service.execute("run-1", "u1")).rejects.toThrow("LLM down");
    expect(runRepo.update).toHaveBeenCalledWith("run-1", {
      status: "failed",
      error: "LLM down",
    });
  });

  it("getRun scopes the lookup to the owning user", async () => {
    await service.getRun("u1", "run-1");
    expect(runRepo.findOne).toHaveBeenCalledWith({
      where: { id: "run-1", userId: "u1" },
    });
  });
});
