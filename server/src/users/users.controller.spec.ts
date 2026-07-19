import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { DataExportService } from "./data-export.service";
import { DataImportService } from "./data-import.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

describe("UsersController", () => {
  let controller: UsersController;
  let usersService: UsersService;
  let dataImportService: DataImportService;

  const mockUsersService = {
    getConsentStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    acceptConsent: jest.fn(),
  };

  const mockDataExportService = {
    exportUserData: jest.fn(),
  };

  const mockDataImportService = {
    importUserData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: DataExportService,
          useValue: mockDataExportService,
        },
        {
          provide: DataImportService,
          useValue: mockDataImportService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
    dataImportService = module.get<DataImportService>(DataImportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getConsentStatus", () => {
    it("should return consent status", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockStatus = {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      };

      mockUsersService.getConsentStatus.mockResolvedValue(mockStatus);

      const result = await controller.getConsentStatus(mockRequest);

      expect(result).toEqual(mockStatus);
      expect(usersService.getConsentStatus).toHaveBeenCalledWith(userId);
    });
  });

  describe("getProfile", () => {
    it("should return user profile without password", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        email: "test@example.com",
        name: "Test User",
        password: "hashed-password",
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.getProfile(mockRequest);

      expect(result).not.toHaveProperty("password");
      expect(result.id).toBe(userId);
      expect(result.email).toBe("test@example.com");
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });
  });

  describe("updateProfile", () => {
    it("should update user profile", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const updates = { name: "Updated Name" };
      const mockUpdatedUser = {
        id: userId,
        name: "Updated Name",
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.updateProfile(mockRequest, updates);

      expect(result).toEqual(mockUpdatedUser);
      expect(usersService.update).toHaveBeenCalledWith(userId, updates);
    });
  });

  describe("acceptConsent", () => {
    it("should accept consent", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        termsAccepted: true,
        privacyAccepted: true,
      };
      const mockResult = {
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
      };

      mockUsersService.acceptConsent.mockResolvedValue(mockResult);

      const result = await controller.acceptConsent(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(usersService.acceptConsent).toHaveBeenCalledWith(
        userId,
        body.termsAccepted,
        body.privacyAccepted,
      );
    });
  });

  describe("markTourComplete", () => {
    it("should mark tour as complete", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUpdatedUser = {
        id: userId,
        hasSeenTour: true,
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.markTourComplete(mockRequest);

      expect(result).toEqual(mockUpdatedUser);
      expect(usersService.update).toHaveBeenCalledWith(userId, {
        hasSeenTour: true,
      });
    });
  });

  describe("importData", () => {
    it("should import user data successfully", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const importData = {
        version: "1.0",
        exportedAt: "2024-01-01T00:00:00.000Z",
        profile: { displayName: "Test User" },
        batchSchedule: null,
        blockedSenders: [],
        blockedKeywords: [],
        contexts: [],
        toneRules: [],
        summarizationRules: [],
        autoResponderSettings: null,
        integrations: { hasOpenAiApiKey: false, hasGithubToken: false },
      };
      const mockResult = {
        success: true,
        imported: {
          profile: true,
          batchSchedule: false,
          blockedSenders: 0,
          blockedKeywords: 0,
          contexts: 0,
          toneRules: 0,
          summarizationRules: 0,
          autoResponderSettings: false,
        },
        skipped: {
          blockedSenders: 0,
          blockedKeywords: 0,
          contexts: 0,
        },
        errors: [],
      };

      mockDataImportService.importUserData.mockResolvedValue(mockResult);

      const result = await controller.importData(mockRequest, {
        importPayload: importData,
      });

      expect(result).toEqual(mockResult);
      expect(dataImportService.importUserData).toHaveBeenCalledWith(
        userId,
        importData,
        undefined,
      );
    });

    it("should import user data with options", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const importData = {
        version: "1.0",
        exportedAt: "2024-01-01T00:00:00.000Z",
        blockedSenders: [
          {
            email: "spam@example.com",
            blockedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      };
      const options = {
        mergeMode: "replace" as const,
        sections: { blockedSenders: true },
      };
      const mockResult = {
        success: true,
        imported: {
          profile: false,
          batchSchedule: false,
          blockedSenders: 1,
          blockedKeywords: 0,
          contexts: 0,
          toneRules: 0,
          summarizationRules: 0,
          autoResponderSettings: false,
        },
        skipped: {
          blockedSenders: 0,
          blockedKeywords: 0,
          contexts: 0,
        },
        errors: [],
      };

      mockDataImportService.importUserData.mockResolvedValue(mockResult);

      const result = await controller.importData(mockRequest, {
        importPayload: importData,
        options,
      });

      expect(result).toEqual(mockResult);
      expect(dataImportService.importUserData).toHaveBeenCalledWith(
        userId,
        importData,
        options,
      );
    });

    it("should throw BadRequestException when data is missing", async () => {
      const mockRequest = { user: { userId: "user-123" } };

      await expect(
        controller.importData(mockRequest, { importPayload: null }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
