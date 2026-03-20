import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import PgBoss from "pg-boss";

import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UsersService } from "../users/users.service";
import { OnboardingService } from "./onboarding.service";

describe("OnboardingService", () => {
  let service: OnboardingService;
  let boss: jest.Mocked<PgBoss>;
  let usersService: jest.Mocked<UsersService>;
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
    jest.clearAllMocks();
  });

  describe("startHistoricalScan", () => {
    it("should queue historical email scan job", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);

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
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: null,
      } as any);

      await expect(service.startHistoricalScan("user-1")).rejects.toThrow(
        "Google account not connected",
      );
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("should throw error when access token is missing", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: undefined,
      } as any);

      await expect(service.startHistoricalScan("user-1")).rejects.toThrow(
        "Google account not connected",
      );
    });
  });

  describe("getScanProgress", () => {
    it("should return progress when scan is in progress", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: 50,
        scanTotal: 100,
      } as any);

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
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: null,
        scanTotal: null,
      } as any);

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when scanProgress is null", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: null,
        scanTotal: 100,
      } as any);

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when scanTotal is null", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: 50,
        scanTotal: null,
      } as any);

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({ progress: null });
    });

    it("should return null when user not found", async () => {
      usersService.findOne.mockResolvedValue(null);

      const result = await service.getScanProgress("nonexistent-user");

      expect(result).toEqual({ progress: null });
    });

    it("should handle completed scan (progress equals total)", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: 100,
        scanTotal: 100,
      } as any);

      const result = await service.getScanProgress("user-1");

      expect(result).toEqual({
        progress: {
          current: 100,
          total: 100,
        },
      });
    });

    it("should handle scan at 0%", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        scanProgress: 0,
        scanTotal: 100,
      } as any);

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
});
