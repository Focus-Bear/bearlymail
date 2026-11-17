import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { GMAIL_ACCESS_ISSUE } from "../constants/domain-statuses";
import {
  GOOGLE_PERMISSION_GROUP,
  REQUIRED_GOOGLE_SCOPES,
} from "../constants/google-oauth-scopes";
import { DataExportService } from "./data-export.service";
import { DataImportService } from "./data-import.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { MASKED_SECRET_VALUE, UsersController } from "./users.controller";
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

    it("exposes the Gmail access issue so the inbox can explain an empty mailbox", async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        gmailAccessIssue: GMAIL_ACCESS_ISSUE.MISSING,
        needsRelogin: true,
      });

      const result = await controller.getProfile({
        user: { userId: "user-123" },
      });

      expect(result.gmailAccessIssue).toBe(GMAIL_ACCESS_ISSUE.MISSING);
    });

    it("lists the Google permissions the last sign-in declined so onboarding can warn", async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        googleGrantedScopes: ["email", ...REQUIRED_GOOGLE_SCOPES].join(" "),
      });

      const result = await controller.getProfile({
        user: { userId: "user-123" },
      });

      expect(result.missingGooglePermissions).toEqual([
        GOOGLE_PERMISSION_GROUP.CALENDAR,
        GOOGLE_PERMISSION_GROUP.CONTACTS,
      ]);
    });

    it("reports no missing Google permissions when the grant was never recorded", async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        googleGrantedScopes: null,
      });

      const result = await controller.getProfile({
        user: { userId: "user-123" },
      });

      expect(result.missingGooglePermissions).toEqual([]);
    });
  });

  describe("updateProfile", () => {
    it("should update user profile", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const updates = { displayName: "Updated Name" };
      const mockUpdatedUser = {
        id: userId,
        displayName: "Updated Name",
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.updateProfile(mockRequest, updates);

      expect(result).toEqual(mockUpdatedUser);
      expect(usersService.update).toHaveBeenCalledWith(userId, updates);
    });

    it("never writes privilege, identity or credential columns", async () => {
      mockUsersService.update.mockResolvedValue({ id: "user-123" });

      await controller.updateProfile({ user: { userId: "user-123" } }, {
        displayName: "Me",
        isAdmin: true,
        isApproved: true,
        id: "victim-user-id",
        email: "victim@example.com",
        password: "$2b$10$attackerhash",
        subscriptionStatus: "active",
        totpEnabled: false,
        passwordChangedAt: null,
      } as never);

      expect(usersService.update).toHaveBeenCalledWith("user-123", {
        displayName: "Me",
      });
    });

    it("rejects unknown fields and non-null githubToken at the validation pipe", async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const metadata = { type: "body" as const, metatype: UpdateProfileDto };

      await expect(
        pipe.transform({ isAdmin: true }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform({ githubToken: "ghp_stolen" }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { githubToken: null, toneSettings: { rules: ["Be brief"] } },
          metadata,
        ),
      ).resolves.toMatchObject({ githubToken: null });
    });
  });

  describe("credentials never reach the client", () => {
    it("drops the TOTP seed, setup tokens and data key, and masks OAuth tokens", async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: "user-123",
        password: "$2b$10$hash",
        totpSecret: "JBSWY3DPEHPK3PXP",
        passwordSetupTokenHash: "setup-hash",
        emailVerificationTokenHash: "verify-hash",
        passwordResetToken: "reset-hash",
        encryptedDataKey: "wrapped-key",
        githubToken: "ghp_real",
        googleCalendarAccessToken: "ya29.real",
        googleCalendarRefreshToken: "1//real",
      });

      const result = await controller.getProfile({
        user: { userId: "user-123" },
      });

      for (const field of [
        "password",
        "totpSecret",
        "passwordSetupTokenHash",
        "emailVerificationTokenHash",
        "passwordResetToken",
        "encryptedDataKey",
      ]) {
        expect(result).not.toHaveProperty(field);
      }
      expect(result).toMatchObject({
        githubToken: MASKED_SECRET_VALUE,
        googleCalendarAccessToken: MASKED_SECRET_VALUE,
        googleCalendarRefreshToken: MASKED_SECRET_VALUE,
      });
    });
  });

  describe("own AI keys never reach the client", () => {
    const keyFields = {
      openAiApiKey: "sk-user-openai",
      anthropicApiKey: "sk-ant-user",
      typesafeApiKey: "user-jev",
      aiKeyRejections: { openai: "2026-11-10T00:00:00.000Z" },
    };

    it("omits every AI key from GET /users/me", async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        ...keyFields,
      });

      const result = await controller.getProfile({
        user: { userId: "user-123" },
      });

      for (const field of Object.keys(keyFields)) {
        expect(result).not.toHaveProperty(field);
      }
    });

    it("ignores AI keys sent to PUT /users/me and never echoes them back", async () => {
      mockUsersService.update.mockResolvedValue({
        id: "user-123",
        name: "Updated Name",
        ...keyFields,
      });

      const result = await controller.updateProfile(
        { user: { userId: "user-123" } },
        { displayName: "Updated Name", ...keyFields } as never,
      );

      expect(usersService.update).toHaveBeenCalledWith("user-123", {
        displayName: "Updated Name",
      });
      for (const field of Object.keys(keyFields)) {
        expect(result).not.toHaveProperty(field);
      }
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
