import { Test, TestingModule } from "@nestjs/testing";
import { Inject } from "@nestjs/common";
import { ContextController } from "./context.controller";
import { ContextService } from "./context.service";
import { UsersService } from "../users/users.service";
import PgBoss = require("pg-boss");

describe("ContextController", () => {
  let controller: ContextController;
  let contextService: ContextService;
  let usersService: UsersService;
  let boss: PgBoss;

  const mockContextService = {
    getUserContext: jest.fn(),
    getAnalysisProgress: jest.fn(),
    createContext: jest.fn(),
    updateContext: jest.fn(),
    deleteContext: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
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
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
      ],
    }).compile();

    controller = module.get<ContextController>(ContextController);
    contextService = module.get<ContextService>(ContextService);
    usersService = module.get<UsersService>(UsersService);
    boss = module.get<PgBoss>("PG_BOSS");
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    it("should return error when scanProgress is -1", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        scanProgress: -1,
        scanTotal: 100,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

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
        threadCount: 200,
        analyzedCount: 50,
        stats: {},
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockContextService.getAnalysisProgress.mockResolvedValue(
        mockProgressInfo,
      );

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result).toHaveProperty("progress");
      expect(result.progress).toBeGreaterThan(0);
      expect(result.progress).toBeLessThanOrEqual(100);
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
        threadCount: 200,
        analyzedCount: 200,
        stats: {},
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockContextService.getAnalysisProgress.mockResolvedValue(
        mockProgressInfo,
      );

      const result = await controller.getAnalyzeProgress(mockRequest);

      expect(result.progress).toBe(100);
    });
  });
});


