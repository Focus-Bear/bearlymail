import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { mockPartial } from "../../test/helpers/mock-utils";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { Office365Provider } from "./office365.provider";
describe("Office365Provider", () => {
  let provider: Office365Provider;
  let usersService: jest.Mocked<UsersService>;
  let emailsService: jest.Mocked<EmailsService>;
  let scanEmailService: jest.Mocked<ScanEmailService>;
  let office365AccountsService: jest.Mocked<Office365AccountsService>;

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    updatedAt: new Date(),
  };

  const mockAccount = {
    id: "account-123",
    userId: "user-123",
    email: "test@office365.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isPrimary: true,
    isActive: true,
    needsRelogin: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Office365Provider,
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            incrementScanProgress: jest.fn(),
          },
        },
        {
          provide: EmailsService,
          useValue: {
            getEmailByMessageId: jest.fn(),
            createEmail: jest.fn(),
            updateEmail: jest.fn(),
            batchUpdateThreadStarCount: jest.fn(),
            batchUpdateThreadArchivedStatuses: jest.fn(),
            getExistingStarredThreads: jest.fn(),
            updateThreadArchivedStatus: jest.fn(),
          },
        },
        {
          provide: ScanEmailService,
          useValue: {
            findByMessageId: jest.fn(),
            createScanEmail: jest.fn(),
          },
        },
        {
          provide: Office365AccountsService,
          useValue: {
            findPrimary: jest.fn(),
            findAllByUser: jest.fn(),
            findById: jest.fn(),
            updateTokens: jest.fn(),
            hasConnectedOffice365: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: "PG_BOSS",
          useValue: {
            send: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<Office365Provider>(Office365Provider);
    usersService = module.get(UsersService);
    emailsService = module.get(EmailsService);
    scanEmailService = module.get(ScanEmailService);
    office365AccountsService = module.get(Office365AccountsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("isConnected", () => {
    it("should return true if user has connected Office 365 account", async () => {
      office365AccountsService.hasConnectedOffice365.mockResolvedValue(true);

      const result = await provider.isConnected("user-123");

      expect(result).toBe(true);
      expect(
        office365AccountsService.hasConnectedOffice365,
      ).toHaveBeenCalledWith("user-123");
    });

    it("should return false if user has no connected Office 365 account", async () => {
      office365AccountsService.hasConnectedOffice365.mockResolvedValue(false);

      const result = await provider.isConnected("user-123");

      expect(result).toBe(false);
    });
  });

  describe("processScanEmail", () => {
    it("should skip if user not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });

    it("should skip existing scan emails", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(mockAccount);
      scanEmailService.findByMessageId.mockResolvedValue(
        mockPartial({
          id: "existing-123",
          messageId: "msg-123",
        }),
      );

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });

    it("should check for existing scan email before processing", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(mockAccount);
      scanEmailService.findByMessageId.mockResolvedValue(null);

      // The actual API call will fail but we're testing the flow
      try {
        await provider.processScanEmail("user-123", "msg-123");
      } catch {
        // Expected to fail due to missing API mock
      }

      expect(scanEmailService.findByMessageId).toHaveBeenCalledWith(
        "user-123",
        "msg-123",
      );
    });
  });

  describe("syncEmails", () => {
    it("should skip sync if user not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await provider.syncEmails("user-123");

      expect(emailsService.createEmail).not.toHaveBeenCalled();
    });

    it("should handle missing refresh token", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(
        mockPartial({
          ...mockAccount,
          refreshToken: null,
        }),
      );
      usersService.findOne.mockResolvedValue(mockUser);

      // The implementation throws an error when refresh token is missing
      await expect(provider.syncEmails("user-123")).rejects.toThrow();
    });
  });

  describe("scanHistory", () => {
    it("should skip scan if user not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await provider.scanHistory("user-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });
  });

  describe("sendReply", () => {
    it("should throw error if account not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.sendReply(
          "user-123",
          "thread-123",
          "to@example.com",
          "Subject",
          "Body",
        ),
      ).rejects.toThrow("Office 365 account not connected");
    });
  });

  describe("sendEmail", () => {
    it("should throw error if account not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.sendEmail(
          "user-123",
          [{ email: "to@example.com" }],
          "Subject",
          "Body",
        ),
      ).rejects.toThrow("Office 365 account not connected");
    });
  });

  describe("searchEmails", () => {
    it("should return empty array if account not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      const result = await provider.searchEmails("user-123", "query");

      expect(result).toEqual([]);
    });
  });

  describe("archiveThread", () => {
    it("should throw error if account not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.archiveThread("user-123", "thread-123"),
      ).rejects.toThrow("Office 365 account not connected");
    });
  });

  describe("unarchiveThread", () => {
    it("should throw error if account not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.unarchiveThread("user-123", "thread-123"),
      ).rejects.toThrow("Office 365 account not connected");
    });
  });
});
