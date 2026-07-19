import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { mockPartial } from "../../test/helpers/mock-utils";
import { UsersService } from "../../users/users.service";
import { ZohoAccountsService } from "../../zoho-accounts/zoho-accounts.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { ZohoProvider } from "./zoho.provider";
describe("ZohoProvider", () => {
  let provider: ZohoProvider;
  let usersService: jest.Mocked<UsersService>;
  let emailsService: jest.Mocked<EmailsService>;
  let scanEmailService: jest.Mocked<ScanEmailService>;
  let zohoAccountsService: jest.Mocked<ZohoAccountsService>;

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
    accountsServer: "https://accounts.zoho.com",
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

  describe("processScanEmail", () => {
    it("should skip if user not connected", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await provider.processScanEmail("user-123", "msg-123");

      expect(scanEmailService.createScanEmail).not.toHaveBeenCalled();
    });

    it("should skip existing scan emails", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(mockAccount);
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
      zohoAccountsService.findPrimary.mockResolvedValue(mockAccount);
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
      zohoAccountsService.findPrimary.mockResolvedValue(null);

      await provider.syncEmails("user-123");

      expect(emailsService.createEmail).not.toHaveBeenCalled();
    });

    it("should handle missing refresh token", async () => {
      zohoAccountsService.findPrimary.mockResolvedValue(
        mockPartial({
          ...mockAccount,
          refreshToken: null,
        }),
      );
      usersService.findOne.mockResolvedValue(mockUser);

      // The implementation throws an error when refresh token is missing
      await expect(provider.syncEmails("user-123")).rejects.toThrow();
    });

    describe("lastEmailSyncAt advancement (batching regression)", () => {
      beforeEach(() => {
        zohoAccountsService.findPrimary.mockResolvedValue(mockAccount);
        // null lastEmailSyncAt => initial sync; the bug is that a failed sync
        // never advances it, leaving every later sync "initial" (skipBatching).
        usersService.findOne.mockResolvedValue({
          ...mockUser,
          lastEmailSyncAt: null,
        });
      });

      it("does NOT advance lastEmailSyncAt when client validation fails (no sync attempted)", async () => {
        jest
          .spyOn(
            provider as unknown as { validateAndGetZohoClient: () => unknown },
            "validateAndGetZohoClient",
          )
          .mockRejectedValue(new Error("auth failed"));
        const handleSyncError = jest
          .spyOn(
            provider as unknown as { handleSyncError: () => unknown },
            "handleSyncError",
          )
          .mockResolvedValue(undefined);

        await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

        expect(handleSyncError).toHaveBeenCalled();
        // Validation failure means no sync ran, so the initial-sync flag must
        // be preserved — do not stamp lastEmailSyncAt.
        expect(usersService.update).not.toHaveBeenCalledWith(
          "user-123",
          expect.objectContaining({ lastEmailSyncAt: expect.any(Date) }),
        );
      });

      it("advances lastEmailSyncAt when performSync throws after validation", async () => {
        jest
          .spyOn(
            provider as unknown as { validateAndGetZohoClient: () => unknown },
            "validateAndGetZohoClient",
          )
          .mockResolvedValue({
            accessToken: "access-token",
            zohoClient: {},
            zohoAccountId: "zoho-account-1",
          });
        jest
          .spyOn(
            provider as unknown as { performSync: () => unknown },
            "performSync",
          )
          .mockRejectedValue(new Error("sync boom"));
        jest
          .spyOn(
            provider as unknown as { handleSyncError: () => unknown },
            "handleSyncError",
          )
          .mockResolvedValue(undefined);

        await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

        // A failed sync still advanced the flag so the next sync batches.
        expect(usersService.update).toHaveBeenCalledWith("user-123", {
          lastEmailSyncAt: expect.any(Date),
        });
      });
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
