import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";

import { ContextCrudService } from "../context/context-crud.service";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextKey, Source } from "../database/entities/user-context.entity";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { OnboardingService } from "./onboarding.service";

describe("OnboardingService", () => {
  let service: OnboardingService;
  let boss: jest.Mocked<PgBoss>;
  let usersService: jest.Mocked<UsersService>;
  let contextCrudService: jest.Mocked<ContextCrudService>;
  let emailThreadRepository: { count: jest.Mock };
  let contextAnalysisRepository: { findOne: jest.Mock };

  const mockUser = {
    id: "user-1",
    email: "user@example.com",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: "refresh-token",
  };

  beforeEach(async () => {
    emailThreadRepository = {
      count: jest.fn().mockResolvedValue(0),
    };

    contextAnalysisRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: "PG_BOSS",
          useValue: {
            send: jest.fn().mockResolvedValue({ id: "job-1" }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            getOnboardingStatus: jest.fn(),
            completeOnboarding: jest.fn(),
          },
        },
        {
          provide: ContextCrudService,
          useValue: {
            createOrUpdateContext: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
        {
          provide: getRepositoryToken(ContextAnalysis),
          useValue: contextAnalysisRepository,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    boss = module.get("PG_BOSS");
    usersService = module.get(UsersService);
    contextCrudService = module.get(ContextCrudService);
    jest.clearAllMocks();
  });

  describe("startHistoricalScan", () => {
    it("should queue historical email scan job", async () => {
      usersService.findOne.mockResolvedValue(mockUser);

      const result = await service.startHistoricalScan("user-1");

      expect(usersService.findOne).toHaveBeenCalledWith("user-1");
      expect(boss.send).toHaveBeenCalledWith(
        "scan-history",
        { userId: "user-1" },
        expect.any(Object),
      );
      expect(result).toEqual({
        message: "Historical email scan initiated in the background.",
      });
    });

    it("should throw error when user not found", async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(
        service.startHistoricalScan("nonexistent-user"),
      ).rejects.toThrow("User not found");
    });

    it("should throw error when Google account not connected", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(service.startHistoricalScan("user-1")).rejects.toThrow(
        "Google account not connected",
      );
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("should throw error when access token is missing", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: undefined,
        }),
      );

      await expect(service.startHistoricalScan("user-1")).rejects.toThrow(
        "Google account not connected",
      );
    });
  });

  describe("getScanProgress", () => {
    it("should return progress when scan is in progress", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: 50,
          scanTotal: 100,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(usersService.findOne).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({
        progress: {
          current: 50,
          total: 100,
        },
      });
    });

    it("should return null when no scan progress", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: null,
          scanTotal: null,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when scanProgress is null", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: null,
          scanTotal: 100,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when scanTotal is null", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: 50,
          scanTotal: null,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when user not found", async () => {
      usersService.findOne.mockResolvedValue(null);

      const result = await service.getScanProgress("nonexistent-user");

      expect(result).toEqual({ progress: null });
    });

    it("should handle completed scan (progress equals total)", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: 100,
          scanTotal: 100,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({
        progress: {
          current: 100,
          total: 100,
        },
      });
    });

    it("should handle scan at 0%", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          scanProgress: 0,
          scanTotal: 100,
        }),
      );

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({
        progress: {
          current: 0,
          total: 100,
        },
      });
    });
  });

  describe("getEmailImportProgress", () => {
    it("should return isReady: true when analysis is completed and count < 100", async () => {
      emailThreadRepository.count.mockResolvedValue(3);
      contextAnalysisRepository.findOne.mockResolvedValue({
        status: "completed",
        createdAt: new Date(),
      });

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(3);
      expect(result.isReady).toBe(true);
    });

    it("should return isReady: true when analysis has failed (don't block the user on failure)", async () => {
      emailThreadRepository.count.mockResolvedValue(3);
      contextAnalysisRepository.findOne.mockResolvedValue({
        status: "failed",
        createdAt: new Date(),
      });

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(3);
      expect(result.isReady).toBe(true);
    });

    it("should return isReady: false when analysis is still running and count < 100", async () => {
      emailThreadRepository.count.mockResolvedValue(3);
      contextAnalysisRepository.findOne.mockResolvedValue({
        status: "running",
        createdAt: new Date(),
      });

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(3);
      expect(result.isReady).toBe(false);
    });

    it("should return isReady: false when analysis is pending and count < 100", async () => {
      emailThreadRepository.count.mockResolvedValue(5);
      contextAnalysisRepository.findOne.mockResolvedValue({
        status: "pending",
        createdAt: new Date(),
      });

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(5);
      expect(result.isReady).toBe(false);
    });

    it("should return isReady: true when count >= 100 regardless of analysis status (backwards-compat)", async () => {
      emailThreadRepository.count.mockResolvedValue(150);
      contextAnalysisRepository.findOne.mockResolvedValue({
        status: "running",
        createdAt: new Date(),
      });

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(150);
      expect(result.isReady).toBe(true);
    });

    it("should return isReady: false when no analysis record exists and count < 100", async () => {
      emailThreadRepository.count.mockResolvedValue(10);
      contextAnalysisRepository.findOne.mockResolvedValue(null);

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(10);
      expect(result.isReady).toBe(false);
    });

    it("should return isReady: true when count >= 100 and no analysis record exists", async () => {
      emailThreadRepository.count.mockResolvedValue(100);
      contextAnalysisRepository.findOne.mockResolvedValue(null);

      const result = await service.getEmailImportProgress("user-1");

      expect(result.prioritizedCount).toBe(100);
      expect(result.isReady).toBe(true);
    });
  });

  describe("completeOnboarding", () => {
    it("should call usersService.completeOnboarding and create Newsletters category", async () => {
      usersService.completeOnboarding.mockResolvedValue(
        mockPartial({ id: "user-1" }),
      );
      contextCrudService.createOrUpdateContext.mockResolvedValue(
        mockPartial({}),
      );

      const result = await service.completeOnboarding("user-1");

      expect(usersService.completeOnboarding).toHaveBeenCalledWith("user-1");
      expect(contextCrudService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.EMAIL_CATEGORY,
        "Newsletters",
        Source.AUTOGENERATED,
      );
      expect(result).toEqual({ success: true });
    });

    it("should still succeed if default category creation fails", async () => {
      usersService.completeOnboarding.mockResolvedValue(
        mockPartial({ id: "user-1" }),
      );
      contextCrudService.createOrUpdateContext.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.completeOnboarding("user-1");

      expect(result).toEqual({ success: true });
    });
  });
});
