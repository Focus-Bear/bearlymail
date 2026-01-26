import { Test, TestingModule } from "@nestjs/testing";
import { Office365Provider } from "./office365.provider";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { ConfigService } from "@nestjs/config";
import PgBoss = require("pg-boss");
import { MINUTES, MILLISECONDS } from "../../constants/time-constants";
import axios from "axios";

describe("Office365Provider", () => {
  let provider: Office365Provider;
  let usersService: jest.Mocked<UsersService>;
  let emailsService: jest.Mocked<EmailsService>;
  let scanEmailService: jest.Mocked<ScanEmailService>;
  let office365AccountsService: jest.Mocked<Office365AccountsService>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let configService: jest.Mocked<ConfigService>;
  let boss: jest.Mocked<PgBoss>;

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
    configService = module.get(ConfigService);
    boss = module.get("PG_BOSS");
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

  describe("parseOffice365Message", () => {
    it("should parse Microsoft Graph message to RawEmailMessage", () => {
      const messageData = {
        id: "msg-123",
        conversationId: "conv-123",
        subject: "Test Subject",
        from: {
          emailAddress: {
            address: "sender@example.com",
            name: "Test Sender",
          },
        },
        receivedDateTime: "2024-01-01T00:00:00Z",
        isRead: false,
        body: {
          contentType: "html",
          content: "<p>Test body</p>",
        },
        importance: "high",
      };

      // Access private method via type casting
      const result = (provider as any).parseOffice365Message(messageData);

      expect(result).toBeDefined();
      expect(result?.messageId).toBe("msg-123");
      expect(result?.threadId).toBe("conv-123");
      expect(result?.subject).toBe("Test Subject");
      expect(result?.from).toBe("sender@example.com");
      expect(result?.fromName).toBe("Test Sender");
      expect(result?.starCount).toBe(3); // high importance = 3 stars
      expect(result?.isRead).toBe(false);
    });

    it("should handle missing optional fields", () => {
      const messageData = {
        id: "msg-123",
        subject: "",
        from: {},
        receivedDateTime: "2024-01-01T00:00:00Z",
        bodyPreview: "Preview text",
      };

      const result = (provider as any).parseOffice365Message(messageData);

      expect(result).toBeDefined();
      expect(result?.subject).toBe("(No Subject)");
      expect(result?.from).toBe("");
      expect(result?.body).toContain("Preview text");
    });

    it("should return null for invalid message", () => {
      const messageData = {
        id: "",
      };

      const result = (provider as any).parseOffice365Message(messageData);

      expect(result).toBeNull();
    });
  });

  describe("isWithinGracePeriod", () => {
    it("should return true if user updated within 5 minutes", () => {
      const recentUser = {
        updatedAt: new Date(
          Date.now() - 2 * MINUTES.FIVE * MILLISECONDS.MINUTE,
        ),
      };

      const result = (provider as any).isWithinGracePeriod(recentUser);

      expect(result).toBe(true);
    });

    it("should return false if user updated more than 5 minutes ago", () => {
      const oldUser = {
        updatedAt: new Date(
          Date.now() - 10 * MINUTES.FIVE * MILLISECONDS.MINUTE,
        ),
      };

      const result = (provider as any).isWithinGracePeriod(oldUser);

      expect(result).toBe(false);
    });

    it("should return false if user has no updatedAt", () => {
      const userWithoutDate = {};

      const result = (provider as any).isWithinGracePeriod(userWithoutDate);

      expect(result).toBe(false);
    });
  });

  describe("processScanEmail", () => {
    it("should process scan email and track progress", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(
        mockAccount as any,
      );
      scanEmailService.findByMessageId.mockResolvedValue(null);
      usersService.incrementScanProgress.mockResolvedValue({
        scanProgress: 10,
        scanTotal: 100,
        isComplete: false,
      });

      // Mock axios for Graph API call
      jest.spyOn(axios, "create").mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: {
            id: "msg-123",
            conversationId: "conv-123",
            subject: "Test",
            from: { emailAddress: { address: "test@example.com" } },
            receivedDateTime: "2024-01-01T00:00:00Z",
            body: { contentType: "text", content: "Body" },
            importance: "normal",
            parentFolderId: "inbox",
          },
        }),
      } as any);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).toHaveBeenCalled();
      expect(usersService.incrementScanProgress).toHaveBeenCalled();
    });

    it("should skip existing scan emails", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(
        mockAccount as any,
      );
      scanEmailService.findByMessageId.mockResolvedValue({
        id: "existing-123",
        messageId: "msg-123",
      } as any);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });

    it("should trigger analysis job when scan completes", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(
        mockAccount as any,
      );
      scanEmailService.findByMessageId.mockResolvedValue(null);
      usersService.incrementScanProgress.mockResolvedValue({
        scanProgress: 100,
        scanTotal: 100,
        isComplete: true,
      });

      jest.spyOn(axios, "create").mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: {
            id: "msg-123",
            conversationId: "conv-123",
            subject: "Test",
            from: { emailAddress: { address: "test@example.com" } },
            receivedDateTime: "2024-01-01T00:00:00Z",
            body: { contentType: "text", content: "Body" },
            importance: "normal",
            parentFolderId: "inbox",
          },
        }),
      } as any);

      await provider.processScanEmail("user-123", "msg-123");

      expect(boss.send).toHaveBeenCalledWith(
        "analyze-scan-results",
        { userId: "user-123" },
        expect.any(Object),
      );
    });
  });

  describe("syncEmails", () => {
    it("should skip sync if user not connected", async () => {
      office365AccountsService.findPrimary.mockResolvedValue(null);

      await provider.syncEmails("user-123");

      expect(emailsService.createEmail).not.toHaveBeenCalled();
    });

    it("should handle grace period for recent logins", async () => {
      const recentUser = {
        ...mockUser,
        updatedAt: new Date(
          Date.now() - 2 * MINUTES.FIVE * MILLISECONDS.MINUTE,
        ),
      };
      office365AccountsService.findPrimary.mockResolvedValue({
        ...mockAccount,
        refreshToken: null,
      } as any);
      usersService.findOne.mockResolvedValue(recentUser as any);

      await expect(provider.syncEmails("user-123")).rejects.toThrow(
        "Refresh token missing (within grace period - will retry)",
      );
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
