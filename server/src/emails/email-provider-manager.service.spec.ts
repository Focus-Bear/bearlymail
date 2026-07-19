import { Test, TestingModule } from "@nestjs/testing";

import { mockPartial } from "../test/helpers/mock-utils";
import { EmailProviderManager } from "./email-provider-manager.service";
import { AppleMailProvider } from "./providers/apple-mail.provider";
import { GmailProvider } from "./providers/gmail.provider";
import { Office365Provider } from "./providers/office365.provider";
import { ZohoProvider } from "./providers/zoho.provider";

describe("EmailProviderManager", () => {
  let service: EmailProviderManager;
  let gmailProvider: jest.Mocked<GmailProvider>;
  let office365Provider: jest.Mocked<Office365Provider>;
  let zohoProvider: jest.Mocked<ZohoProvider>;
  let appleMailProvider: jest.Mocked<AppleMailProvider>;

  beforeEach(async () => {
    gmailProvider = mockPartial({
      isConnected: jest.fn(),
      syncEmails: jest.fn(),
      convertLabelIdsToNames: jest.fn(),
    });

    office365Provider = mockPartial({
      isConnected: jest.fn().mockResolvedValue(false),
      syncEmails: jest.fn(),
    });

    zohoProvider = mockPartial({
      isConnected: jest.fn().mockResolvedValue(false),
      syncEmails: jest.fn(),
    });

    appleMailProvider = mockPartial({
      isConnected: jest.fn().mockResolvedValue(false),
      syncEmails: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProviderManager,
        {
          provide: GmailProvider,
          useValue: gmailProvider,
        },
        {
          provide: Office365Provider,
          useValue: office365Provider,
        },
        {
          provide: ZohoProvider,
          useValue: zohoProvider,
        },
        {
          provide: AppleMailProvider,
          useValue: appleMailProvider,
        },
      ],
    }).compile();

    service = module.get<EmailProviderManager>(EmailProviderManager);
    jest.clearAllMocks();
  });

  describe("getProvider", () => {
    it("should return Gmail provider when user is connected", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);

      const result = await service.getProvider("user-1", "gmail");

      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
      expect(result).toBe(gmailProvider);
    });

    it("should return null when user is not connected", async () => {
      gmailProvider.isConnected.mockResolvedValue(false);

      const result = await service.getProvider("user-1", "gmail");

      expect(result).toBeNull();
    });

    it("should return null for unknown provider type", async () => {
      const result = await service.getProvider("user-1", "unknown-provider");

      expect(result).toBeNull();
      expect(gmailProvider.isConnected).not.toHaveBeenCalled();
    });

    it("should default to gmail provider type", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);

      const result = await service.getProvider("user-1");

      expect(result).toBe(gmailProvider);
      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
    });
  });

  describe("getPrimaryProvider", () => {
    it("should return Gmail provider when user is connected", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);

      const result = await service.getPrimaryProvider("user-1");

      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
      expect(result).toBe(gmailProvider);
    });

    it("should return null when user is not connected to any provider", async () => {
      gmailProvider.isConnected.mockResolvedValue(false);

      const result = await service.getPrimaryProvider("user-1");

      expect(result).toBeNull();
    });

    it("should try providers in priority order", async () => {
      gmailProvider.isConnected.mockResolvedValue(false);

      const result = await service.getPrimaryProvider("user-1");

      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
      expect(result).toBeNull();
    });
  });

  describe("syncAllProviders", () => {
    it("should sync all connected providers", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);
      gmailProvider.syncEmails.mockResolvedValue(undefined);

      await service.syncAllProviders("user-1");

      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
      expect(gmailProvider.syncEmails).toHaveBeenCalledWith(
        "user-1",
        undefined,
      );
    });

    it("should skip providers that are not connected", async () => {
      gmailProvider.isConnected.mockResolvedValue(false);

      await service.syncAllProviders("user-1");

      expect(gmailProvider.isConnected).toHaveBeenCalledWith("user-1");
      expect(gmailProvider.syncEmails).not.toHaveBeenCalled();
    });

    it("should handle sync errors gracefully", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);
      gmailProvider.syncEmails.mockRejectedValue(new Error("Sync failed"));

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await service.syncAllProviders("user-1");

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to sync gmail for user user-1",
        expect.any(Error),
      );

      loggerErrorSpy.mockRestore();
    });

    it("should continue syncing other providers after error", async () => {
      gmailProvider.isConnected.mockResolvedValue(true);
      gmailProvider.syncEmails.mockRejectedValue(new Error("Sync failed"));

      // Should not throw
      await expect(service.syncAllProviders("user-1")).resolves.not.toThrow();
    });
  });

  describe("convertLabelIdsToNames", () => {
    it("should delegate to Gmail provider", async () => {
      const labelIds = ["INBOX", "SENT"];
      const labelNames = ["Inbox", "Sent"];
      gmailProvider.convertLabelIdsToNames.mockResolvedValue(labelNames);

      const result = await service.convertLabelIdsToNames("user-1", labelIds);

      expect(gmailProvider.convertLabelIdsToNames).toHaveBeenCalledWith(
        "user-1",
        labelIds,
      );
      expect(result).toEqual(labelNames);
    });

    it("should handle empty label IDs array", async () => {
      gmailProvider.convertLabelIdsToNames.mockResolvedValue([]);

      const result = await service.convertLabelIdsToNames("user-1", []);

      expect(result).toEqual([]);
    });
  });
});
