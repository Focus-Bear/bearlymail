import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuditService } from "../audit/audit.service";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { User } from "../database/entities/user.entity";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { CategoryConsolidationRunService } from "./category-consolidation-run.service";
import { ContextController } from "./context.controller";
import { ContextService } from "./context.service";

describe("ContextController", () => {
  let controller: ContextController;
  let contextService: ContextService;

  const mockContextService = {
    getUserContext: jest.fn(),
    getAnalysisProgress: jest.fn(),
    createContext: jest.fn(),
    updateContext: jest.fn(),
    deleteContext: jest.fn(),
    checkAndSyncJobs: jest.fn(),
    approveQA: jest.fn(),
    rejectQA: jest.fn(),
    approveAllQA: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockConsolidationRunService = {
    enqueue: jest.fn(),
    getRun: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
  };

  const mockQueryBuilder = {
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockContextAnalysisRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockUserRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextController],
      providers: [
        {
          provide: ContextService,
          useValue: mockContextService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: CategoryConsolidationRunService,
          useValue: mockConsolidationRunService,
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
        {
          provide: getRepositoryToken(ContextAnalysis),
          useValue: mockContextAnalysisRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    })
      .overrideGuard(AiCapacityGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ContextController>(ContextController);
    contextService = module.get<ContextService>(ContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.take.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.getMany.mockResolvedValue([]);
  });

  describe("getContext", () => {
    it("should return user context", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockContext = [
        { contextKey: "VIP_CONTACT", contextValue: "test@example.com" },
      ];

      mockContextService.getUserContext.mockResolvedValue(mockContext);

      const result = await controller.getContext(mockRequest);

      expect(result).toEqual(mockContext);
      expect(contextService.getUserContext).toHaveBeenCalledWith(userId);
    });
  });

  describe("getAnalyzeProgress", () => {
    it("should return null progress when user not found", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockUsersService.findOne.mockResolvedValue(null);

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result).toEqual({ progress: null, error: null });
    });

    it("should return error when analysis failed", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        scanProgress: -1,
        scanTotal: 100,
      };
      const mockProgressInfo = {
        status: "failed",
        errorMessage: "Analysis failed. Please try again.",
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockContextService.getAnalysisProgress.mockResolvedValue(
        mockProgressInfo,
      );

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result).toEqual({
        progress: null,
        error: "Analysis failed. Please try again.",
      });
    });

    it("should return progress when analysis is in progress", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        scanProgress: 50,
        scanTotal: 100,
      };
      const mockProgressInfo = {
        status: "running",
        threadCount: 200,
        analyzedCount: 50,
        completedBatches: 5,
        totalBatches: 10,
        stats: {},
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockContextService.getAnalysisProgress.mockResolvedValue(
        mockProgressInfo,
      );
      mockContextService.checkAndSyncJobs.mockResolvedValue(undefined);

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result).toHaveProperty("progress");
      expect(result.progress.current).toBeGreaterThan(0);
      expect(result.progress.current).toBeLessThanOrEqual(100);
    });

    it("should return 100% when analysis is complete", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        scanProgress: 100,
        scanTotal: 100,
      };
      const mockProgressInfo = {
        status: "completed",
        threadCount: 200,
        analyzedCount: 200,
        completedBatches: 10,
        totalBatches: 10,
        stats: {},
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockContextService.getAnalysisProgress.mockResolvedValue(
        mockProgressInfo,
      );

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result.progress.current).toBe(100);
    });
  });

  describe("getAdminAnalyses", () => {
    it("includes analyses with batch-level errors in failed filter even when status is completed", async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          id: "analysis-completed-with-batch-failure",
          correlationId: "corr-1",
          userId: "user-1",
          status: "completed",
          errorMessage: null,
          progress: 100,
          threadCount: 12,
          analyzedCount: 12,
          stats: {
            totalBatches: 2,
            batchResults: {
              "0": { completedAt: "2026-03-02T06:00:00.000Z" },
              "1": {
                error: "OpenAI timeout",
                failedAt: "2026-03-02T06:01:00.000Z",
              },
            },
          },
          createdAt: new Date("2026-03-02T06:00:00.000Z"),
          updatedAt: new Date("2026-03-02T06:01:00.000Z"),
        },
      ]);
      mockUserRepository.find.mockResolvedValue([
        { id: "user-1", email: "failed@example.com" },
      ]);

      const result = await controller.getAdminAnalyses("50", "failed");

      // 50 (limit) * 5 (FAILURE_VIEW_LIMIT_MULTIPLIER) = 250, which equals MIN_FAILURE_VIEW_QUERY_LIMIT
      // so Math.max picks MIN_FAILURE_VIEW_QUERY_LIMIT; derive from the constant rather than hardcoding
      const expectedLimit = (
        ContextController as unknown as Record<string, number>
      )["MIN_FAILURE_VIEW_QUERY_LIMIT"];
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(expectedLimit);
      expect(result.analyses).toHaveLength(1);
      expect(result.analyses[0]).toMatchObject({
        id: "analysis-completed-with-batch-failure",
        userEmail: "failed@example.com",
        failedBatches: 1,
      });
      expect(result.analyses[0].failureDetails).toEqual([
        {
          batchIndex: 1,
          error: "OpenAI timeout",
          failedAt: "2026-03-02T06:01:00.000Z",
          correlationId: null,
          errorType: "unknown",
        },
      ]);
    });

    it("keeps exact status filtering for non-failed filters", async () => {
      await controller.getAdminAnalyses("10", "running");

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "analysis.status = :status",
        { status: "running" },
      );
    });
  });

  describe("approveQA", () => {
    it("returns the approved item when found", async () => {
      const userId = "user-123";
      const contextId = "ctx-1";
      const mockRequest = { user: { userId } };
      const approvedItem = {
        contextId,
        userId,
        contextKey: "Q_AND_A",
        source: "AUTOGENERATED",
      };

      mockContextService.approveQA.mockResolvedValue(approvedItem);

      const result = await controller.approveQA(contextId, mockRequest);

      expect(result).toEqual(approvedItem);
      expect(mockContextService.approveQA).toHaveBeenCalledWith(
        contextId,
        userId,
      );
    });

    it("throws NotFoundException when item not found", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockContextService.approveQA.mockResolvedValue(null);

      await expect(
        controller.approveQA("missing-id", mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("rejectQA", () => {
    it("returns 204 when item is deleted", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockContextService.rejectQA.mockResolvedValue(true);

      await expect(
        controller.rejectQA("ctx-1", mockRequest),
      ).resolves.toBeUndefined();
    });

    it("throws NotFoundException when item not found", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockContextService.rejectQA.mockResolvedValue(false);

      await expect(
        controller.rejectQA("missing-id", mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("approveAllQA", () => {
    it("returns count of approved items", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockContextService.approveAllQA.mockResolvedValue(5);

      const result = await controller.approveAllQA(mockRequest);

      expect(result).toEqual({ approved: 5 });
      expect(mockContextService.approveAllQA).toHaveBeenCalledWith("user-123");
    });

    it("returns zero when no pending Q&A", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockContextService.approveAllQA.mockResolvedValue(0);

      const result = await controller.approveAllQA(mockRequest);

      expect(result).toEqual({ approved: 0 });
    });
  });
});
