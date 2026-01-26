import { Test, TestingModule } from "@nestjs/testing";
import { ZohoProvider } from "./zoho.provider";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { ZohoAccountsService } from "../../zoho-accounts/zoho-accounts.service";
import { ConfigService } from "@nestjs/config";
import PgBoss = require("pg-boss");
import { MINUTES, MILLISECONDS } from "../../constants/time-constants";
import axios from "axios";

describe("ZohoProvider", () => {
  let provider: ZohoProvider;
  let usersService: jest.Mocked<UsersService>;
  let emailsService: jest.Mocked<EmailsService>;
  let scanEmailService: jest.Mocked<ScanEmailService>;
  let zohoAccountsService: jest.Mocked<ZohoAccountsService>;
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
    email: "test@zoho.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isPrimary: true,
    isActive: true,
    needsRelogin: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZohoProvider,
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
          provide: ZohoAccountsService,
          useValue: {
            findPrimary: jest.fn(),
            findAllByUser: jest.fn(),
            findById: jest.fn(),
            updateTokens: jest.fn(),
            hasConnectedZoho: jest.fn(),
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

    provider = module.get<ZohoProvider>(ZohoProvider);
    usersService = module.get(UsersService);
    emailsService = module.get(EmailsService);
    scanEmailService = module.get(ScanEmailService);
    zohoAccountsService = module.get(ZohoAccountsService);
    configService = module.get(ConfigService);
    boss = module.get("PG_BOSS");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("isConnected", () => {
    it("should return true if user has connected Zoho account", async () => {
      zohoAccountsService.hasConnectedZoho.mockResolvedValue(true);

      const result = await provider.isConnected("user-123");

      expect(result).toBe(true);
      expect(zohoAccountsService.hasConnectedZoho).toHaveBeenCalledWith(
        "user-123",
      );
    });

    it("should return false if user has no connected Zoho account", async () => {
      zohoAccountsService.hasConnectedZoho.mockResolvedValue(false);

      const result = await provider.isConnected("user-123");

      expect(result).toBe(false);
    });
  });

  describe("parseZohoMessage", () => {
    it("should parse Zoho Mail message to RawEmailMessage", () => {
      const messageData = {
        uid: "msg-123",
        threadId: "thread-123",
        subject: "Test Subject",
        from: {
          address: "sender@example.com",
          personal: "Test Sender",
        },
        receivedTime: Math.floor(
          new Date("2024-01-01T00:00:00Z").getTime() / 1000,
        ),
        isRead: false,
        content: {
          html: "<p>Test body</p>",
          text: "Test body",
        },
        importance: "high",
      };

      // Access private method via type casting
      const result = (provider as any).parseZohoMessage(messageData);

      expect(result).toBeDefined();
      expect(result?.messageId).toBe("msg-123");
      expect(result?.threadId).toBe("thread-123");
      expect(result?.subject).toBe("Test Subject");
      expect(result?.from).toBe("sender@example.com");
      expect(result?.fromName).toBe("Test Sender");
      expect(result?.starCount).toBe(3); // high importance = 3 stars
      expect(result?.isRead).toBe(false);
      expect(result?.htmlBody).toBe("<p>Test body</p>");
    });

    it("should handle missing optional fields", () => {
      const messageData = {
        uid: "msg-123",
        subject: "",
        from: {},
        receivedTime: Math.floor(Date.now() / 1000),
        content: {},
      };

      const result = (provider as any).parseZohoMessage(messageData);

      expect(result).toBeDefined();
      expect(result?.subject).toBe("(No Subject)");
      expect(result?.from).toBe("");
      expect(result?.body).toBe("(No content)");
    });

    it("should return null for invalid message", () => {
      const messageData = {
        uid: "",
      };

      const result = (provider as any).parseZohoMessage(messageData);

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
      zohoAccountsService.findPrimary.mockResolvedValue(mockAccount as any);
      scanEmailService.findByMessageId.mockResolvedValue(null);
      usersService.incrementScanProgress.mockResolvedValue({
        scanProgress: 10,
        scanTotal: 100,
        isComplete: false,
      });

      // Mock axios for Zoho API call
      jest.spyOn(axios, "create").mockReturnValue({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              data: {
                accounts: [{ accountId: "zoho-account-123" }],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              data: {
                uid: "msg-123",
                threadId: "thread-123",
                subject: "Test",
                from: { address: "test@example.com" },
                receivedTime: Math.floor(Date.now() / 1000),
                content: { text: "Body" },
                importance: "normal",
                folderId: "inbox",
              },
            },
          }),
      } as any);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).toHaveBeenCalled();
      expect(usersService.incrementScanProgress).toHaveBeenCalled();
    });

    it("should skip existing scan emails", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(mockAccount as any);
      scanEmailService.findByMessageId.mockResolvedValue({
        id: "existing-123",
        messageId: "msg-123",
      } as any);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });

    it("should trigger analysis job when scan completes", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(mockAccount as any);
      scanEmailService.findByMessageId.mockResolvedValue(null);
      usersService.incrementScanProgress.mockResolvedValue({
        scanProgress: 100,
        scanTotal: 100,
        isComplete: true,
      });

      jest.spyOn(axios, "create").mockReturnValue({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              data: {
                accounts: [{ accountId: "zoho-account-123" }],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              data: {
                uid: "msg-123",
                threadId: "thread-123",
                subject: "Test",
                from: { address: "test@example.com" },
                receivedTime: Math.floor(Date.now() / 1000),
                content: { text: "Body" },
                importance: "normal",
                folderId: "inbox",
              },
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
      zohoAccountsService.findPrimary.mockResolvedValue(null);

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
      zohoAccountsService.findPrimary.mockResolvedValue({
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
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await provider.scanHistory("user-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });
  });

  describe("sendReply", () => {
    it("should throw error if account not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.sendReply(
          "user-123",
          "thread-123",
          "to@example.com",
          "Subject",
          "Body",
        ),
      ).rejects.toThrow("Zoho Mail account not connected");
    });
  });

  describe("sendEmail", () => {
    it("should throw error if account not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.sendEmail(
          "user-123",
          [{ email: "to@example.com" }],
          "Subject",
          "Body",
        ),
      ).rejects.toThrow("Zoho Mail account not connected");
    });
  });

  describe("searchEmails", () => {
    it("should return empty array if account not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      const result = await provider.searchEmails("user-123", "query");

      expect(result).toEqual([]);
    });
  });

  describe("archiveThread", () => {
    it("should throw error if account not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.archiveThread("user-123", "thread-123"),
      ).rejects.toThrow("Zoho Mail account not connected");
    });
  });

  describe("unarchiveThread", () => {
    it("should throw error if account not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await expect(
        provider.unarchiveThread("user-123", "thread-123"),
      ).rejects.toThrow("Zoho Mail account not connected");
    });
  });
});
