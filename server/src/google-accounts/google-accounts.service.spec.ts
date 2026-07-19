import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { GoogleAccount } from "../database/entities/google-account.entity";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { GoogleAccountsService } from "./google-accounts.service";

describe("GoogleAccountsService", () => {
  let service: GoogleAccountsService;
  let repository: Record<string, unknown>;

  const mockGoogleAccount: GoogleAccount = {
    id: "account-1",
    userId: "user-1",
    googleId: "google-id-1",
    email: "user@gmail.com",
    name: "Test User",
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
    isPrimary: false,
    isActive: true,
    needsRelogin: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as GoogleAccount;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAccountsService,
        {
          provide: getRepositoryToken(GoogleAccount),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<GoogleAccountsService>(GoogleAccountsService);
    repository = module.get(getRepositoryToken(GoogleAccount));
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a new Google account", async () => {
      repository.update.mockResolvedValue(mockPartial({ affected: 0 }));
      repository.create.mockReturnValue(mockGoogleAccount as GoogleAccount);
      repository.save.mockResolvedValue(mockGoogleAccount);

      const result = await service.create({
        userId: "user-1",
        googleId: "google-id-1",
        email: "user@gmail.com",
        name: "Test User",
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        isPrimary: false,
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: "user-1",
        googleId: "google-id-1",
        email: "user@gmail.com",
        name: "Test User",
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        isPrimary: false,
        isActive: true,
        needsRelogin: false,
      });
      expect(repository.save).toHaveBeenCalledWith(mockGoogleAccount);
      expect(result).toEqual(mockGoogleAccount);
    });

    it("should unset other primary accounts when creating primary account", async () => {
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      const primaryAccount = { ...mockGoogleAccount, isPrimary: true };
      repository.create.mockReturnValue(primaryAccount as GoogleAccount);
      repository.save.mockResolvedValue(primaryAccount);

      await service.create({
        userId: "user-1",
        googleId: "google-id-1",
        email: "user@gmail.com",
        name: "Test User",
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        isPrimary: true,
      });

      expect(repository.update).toHaveBeenCalledWith(
        { userId: "user-1", isPrimary: true },
        { isPrimary: false },
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isPrimary: true }),
      );
    });

    it("should create account with default isPrimary false", async () => {
      repository.update.mockResolvedValue(mockPartial({ affected: 0 }));
      repository.create.mockReturnValue(mockGoogleAccount as GoogleAccount);
      repository.save.mockResolvedValue(mockGoogleAccount);

      await service.create({
        userId: "user-1",
        googleId: "google-id-1",
        email: "user@gmail.com",
        name: "Test User",
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isPrimary: false }),
      );
    });
  });

  describe("findAllByUser", () => {
    it("should return all active accounts for a user ordered by primary first", async () => {
      const mockAccounts = [
        { ...mockGoogleAccount, isPrimary: true },
        { ...mockGoogleAccount, id: "account-2", isPrimary: false },
      ];
      repository.find.mockResolvedValue(mockAccounts);

      const result = await service.findAllByUser("user-1");

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-1", isActive: true },
        order: { isPrimary: "DESC", createdAt: "ASC" },
      });
      expect(result).toEqual(mockAccounts);
    });

    it("should return empty array when user has no active accounts", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAllByUser("user-1");

      expect(result).toEqual([]);
    });

    it("should only return active accounts", async () => {
      const activeAccount = { ...mockGoogleAccount, isActive: true };
      repository.find.mockResolvedValue([activeAccount]);

      await service.findAllByUser("user-1");

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-1", isActive: true },
        order: { isPrimary: "DESC", createdAt: "ASC" },
      });
    });
  });

  describe("findPrimary", () => {
    it("should return primary active account for a user", async () => {
      const primaryAccount = { ...mockGoogleAccount, isPrimary: true };
      repository.findOne.mockResolvedValue(primaryAccount);

      const result = await service.findPrimary("user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: "user-1", isPrimary: true, isActive: true },
      });
      expect(result).toEqual(primaryAccount);
    });

    it("should return null when user has no primary account", async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findPrimary("user-1");

      expect(result).toBeNull();
    });

    it("should only return active primary accounts", async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findPrimary("user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: "user-1", isPrimary: true, isActive: true },
      });
    });
  });

  describe("findById", () => {
    it("should return account by id and userId", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);

      const result = await service.findById("account-1", "user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "account-1", userId: "user-1", isActive: true },
      });
      expect(result).toEqual(mockGoogleAccount);
    });

    it("should return null when account not found", async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById("nonexistent-id", "user-1");

      expect(result).toBeNull();
    });

    it("should only return active accounts", async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findById("account-1", "user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "account-1", userId: "user-1", isActive: true },
      });
    });
  });

  describe("updateTokens", () => {
    it("should update access token", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      const updatedAccount = {
        ...mockGoogleAccount,
        accessToken: "new-access-token",
      };
      repository.save.mockResolvedValue(updatedAccount);

      const result = await service.updateTokens(
        "account-1",
        "user-1",
        "new-access-token",
      );

      expect(mockGoogleAccount.accessToken).toBe("new-access-token");
      expect(mockGoogleAccount.needsRelogin).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(mockGoogleAccount);
      expect(result).toEqual(updatedAccount);
    });

    it("should update refresh token when provided", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      const updatedAccount = {
        ...mockGoogleAccount,
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      };
      repository.save.mockResolvedValue(updatedAccount);

      const result = await service.updateTokens(
        "account-1",
        "user-1",
        "new-access-token",
        "new-refresh-token",
      );

      expect(mockGoogleAccount.refreshToken).toBe("new-refresh-token");
      expect(result).toEqual(updatedAccount);
    });

    it("should not update refresh token when not provided", async () => {
      const freshAccount = {
        ...mockGoogleAccount,
        refreshToken: "original-refresh-token",
      };
      repository.findOne.mockResolvedValue(freshAccount);
      const updatedAccount = {
        ...freshAccount,
        accessToken: "new-access-token",
      };
      repository.save.mockResolvedValue(updatedAccount);

      await service.updateTokens("account-1", "user-1", "new-access-token");

      // Original value
      expect(freshAccount.refreshToken).toBe("original-refresh-token");
    });

    it("should throw NotFoundException when account not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.updateTokens("nonexistent-id", "user-1", "new-access-token"),
      ).rejects.toThrow(NotFoundException);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "nonexistent-id", userId: "user-1", isActive: true },
      });
    });

    it("should set needsRelogin to false after token update", async () => {
      const accountWithRelogin = { ...mockGoogleAccount, needsRelogin: true };
      repository.findOne.mockResolvedValue(accountWithRelogin);
      repository.save.mockResolvedValue({
        ...accountWithRelogin,
        needsRelogin: false,
      });

      await service.updateTokens("account-1", "user-1", "new-access-token");

      expect(accountWithRelogin.needsRelogin).toBe(false);
    });
  });

  describe("setPrimary", () => {
    it("should set account as primary and unset others", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      const primaryAccount = { ...mockGoogleAccount, isPrimary: true };
      repository.save.mockResolvedValue(primaryAccount);

      const result = await service.setPrimary("account-1", "user-1");

      expect(repository.update).toHaveBeenCalledWith(
        { userId: "user-1", isPrimary: true },
        { isPrimary: false },
      );
      expect(mockGoogleAccount.isPrimary).toBe(true);
      expect(repository.save).toHaveBeenCalledWith(mockGoogleAccount);
      expect(result).toEqual(primaryAccount);
    });

    it("should throw NotFoundException when account not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.setPrimary("nonexistent-id", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should unset other primary accounts before setting new primary", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      repository.update.mockResolvedValue(mockPartial({ affected: 2 }));
      repository.save.mockResolvedValue({
        ...mockGoogleAccount,
        isPrimary: true,
      });

      await service.setPrimary("account-1", "user-1");

      // Verify both methods were called
      expect(repository.update).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe("deactivate", () => {
    it("should deactivate an account", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      const deactivatedAccount = { ...mockGoogleAccount, isActive: false };
      repository.save.mockResolvedValue(deactivatedAccount);

      await service.deactivate("account-1", "user-1");

      expect(mockGoogleAccount.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(mockGoogleAccount);
    });

    it("should throw NotFoundException when account not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivate("nonexistent-id", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should only deactivate accounts for the specified user", async () => {
      repository.findOne.mockResolvedValue(mockGoogleAccount);
      repository.save.mockResolvedValue({
        ...mockGoogleAccount,
        isActive: false,
      });

      await service.deactivate("account-1", "user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "account-1", userId: "user-1", isActive: true },
      });
    });
  });

  describe("hasConnectedGmail", () => {
    it("should return true when user has active accounts", async () => {
      repository.count.mockResolvedValue(1);

      const result = await service.hasConnectedGmail("user-1");

      expect(repository.count).toHaveBeenCalledWith({
        where: { userId: "user-1", isActive: true },
      });
      expect(result).toBe(true);
    });

    it("should return false when user has no active accounts", async () => {
      repository.count.mockResolvedValue(0);

      const result = await service.hasConnectedGmail("user-1");

      expect(result).toBe(false);
    });

    it("should only count active accounts", async () => {
      repository.count.mockResolvedValue(0);

      await service.hasConnectedGmail("user-1");

      expect(repository.count).toHaveBeenCalledWith({
        where: { userId: "user-1", isActive: true },
      });
    });
  });
});
