import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  DeletedAccount,
  DeletionReason,
} from "../database/entities/deleted-account.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "./users.service";

jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      hashEmail: jest.fn((email: string) => `hash_${email.toLowerCase()}`),
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

jest.mock("../auth/auth-logger", () => ({
  writeDebugLog: jest.fn(),
}));

describe("UsersService", () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;
  let deletedAccountRepository: jest.Mocked<Repository<DeletedAccount>>;

  const mockUser: User = {
    id: "user-1",
    email: "test@example.com",
    emailHash: "hash_test@example.com",
    scanProgress: 0,
    scanTotal: 100,
    hasScannedHistory: false,
    termsAcceptedAt: null,
    termsVersion: null,
    privacyAcceptedAt: null,
    privacyVersion: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            query: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DeletedAccount),
          useValue: {
            findOne: jest.fn(),
            upsert: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
    deletedAccountRepository = module.get(getRepositoryToken(DeletedAccount));
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a user with email hash", async () => {
      const userData = {
        email: "test@example.com",
        name: "Test User",
      };
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);

      const result = await service.create(userData);

      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(repository.create).toHaveBeenCalledWith({
        ...userData,
        emailHash: "hash_test@example.com",
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    it("should not generate email hash if already provided", async () => {
      const userData = {
        email: "test@example.com",
        emailHash: "existing-hash",
      };
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);

      await service.create(userData);

      expect(EncryptionHelper.hashEmail).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(userData);
    });

    it("should create user without email", async () => {
      const userData = { name: "Test User" };
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);

      await service.create(userData);

      expect(EncryptionHelper.hashEmail).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(userData);
    });
  });

  describe("findOne", () => {
    it("should return user by id", async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne("user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return undefined when user not found", async () => {
      repository.findOne.mockResolvedValue(undefined);

      const result = await service.findOne("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("findByEmail", () => {
    it("should find user by email hash", async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail("test@example.com");

      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { emailHash: "hash_test@example.com" },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return null when user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail("nonexistent@example.com");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all users", async () => {
      const users = [mockUser];
      repository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(repository.find).toHaveBeenCalled();
      expect(result).toEqual(users);
    });

    it("should return empty array when no users", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe("markNeedsRelogin", () => {
    it("sets needsRelogin plus the logout reason and timestamp", async () => {
      const existingUser = { ...mockUser };
      jest.spyOn(service, "findOneLightweight").mockResolvedValue(existingUser);
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);

      const before = Date.now();
      await service.markNeedsRelogin("user-1", "gmail_invalid_token");
      const after = Date.now();

      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = repository.save.mock.calls[0][0] as User;
      expect(saved.needsRelogin).toBe(true);
      expect(saved.lastLogoutReason).toBe("gmail_invalid_token");
      expect(saved.lastLogoutAt).toBeInstanceOf(Date);
      expect(saved.lastLogoutAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.lastLogoutAt!.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe("markSyncWindowLimited", () => {
    it("persists syncWindowLimited=true for the user", async () => {
      const existingUser = { ...mockUser, syncWindowLimited: false };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);

      await service.markSyncWindowLimited("user-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = repository.save.mock.calls[0][0] as User;
      expect(saved.syncWindowLimited).toBe(true);
    });
  });

  describe("update", () => {
    it("should update user", async () => {
      const existingUser = { ...mockUser };
      const updatedUser = { ...mockUser, name: "Updated Name" };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockResolvedValue(updatedUser);

      const result = await service.update("user-1", { name: "Updated Name" });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(updatedUser);
    });

    it("should generate email hash when email is updated", async () => {
      const existingUser = { ...mockUser };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);

      await service.update("user-1", { email: "new@example.com" });

      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "new@example.com",
      );
      expect(existingUser.emailHash).toBe("hash_new@example.com");
    });

    it("should not generate email hash if emailHash is provided in update", async () => {
      const existingUser = { ...mockUser };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);

      await service.update("user-1", {
        email: "new@example.com",
        emailHash: "provided-hash",
      });

      expect(EncryptionHelper.hashEmail).not.toHaveBeenCalled();
      expect(existingUser.emailHash).toBe("provided-hash");
    });

    it("should throw error if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { name: "Test" }),
      ).rejects.toThrow("User with id nonexistent not found");
    });

    // Diagnostic for the recurring "logged out again" reports: every relogin
    // flip must emit a single greppable [NEEDS_RELOGIN] WARN line so the cause
    // is visible in CloudWatch (where the worker filters out debug/verbose).
    it("logs a [NEEDS_RELOGIN] warning when needsRelogin is set to true", async () => {
      const existingUser = { ...mockUser, needsRelogin: false };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);
      const loggerInstance = (service as unknown as { logger: Logger }).logger;
      const warnSpy = jest
        .spyOn(loggerInstance, "warn")
        .mockImplementation(() => undefined);

      await service.update("user-1", { needsRelogin: true });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[NEEDS_RELOGIN] user=user-1"),
      );
      warnSpy.mockRestore();
    });

    it("does NOT log a [NEEDS_RELOGIN] warning for ordinary updates", async () => {
      const existingUser = { ...mockUser };
      repository.findOne.mockResolvedValue(existingUser);
      repository.save.mockImplementation(async (user) => user as User);
      const loggerInstance = (service as unknown as { logger: Logger }).logger;
      const warnSpy = jest
        .spyOn(loggerInstance, "warn")
        .mockImplementation(() => undefined);

      await service.update("user-1", { name: "Updated Name" });

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("incrementScanProgress", () => {
    beforeEach(() => {
      process.env.TERMS_VERSION = "1.0.0";
      process.env.PRIVACY_VERSION = "1.0.0";
    });

    it("should increment scan progress atomically", async () => {
      repository.query.mockResolvedValue([{ affected: 1 }]);
      const userWithProgress = {
        ...mockUser,
        scanProgress: 50,
        scanTotal: 100,
      };
      repository.findOne.mockResolvedValue(userWithProgress);

      const result = await service.incrementScanProgress("user-1");

      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users"),
        ["user-1", 1],
      );
      expect(result.scanProgress).toBe(50);
      expect(result.scanTotal).toBe(100);
    });

    it("should mark scan as complete when progress reaches total", async () => {
      repository.query.mockResolvedValue([{ affected: 1 }]);
      const userComplete = {
        ...mockUser,
        scanProgress: 100,
        scanTotal: 100,
        hasScannedHistory: false,
      };
      repository.findOne.mockResolvedValue(userComplete);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.incrementScanProgress("user-1");

      expect(result.isComplete).toBe(true);
      expect(repository.update).toHaveBeenCalledWith("user-1", {
        hasScannedHistory: true,
      });
    });

    it("should not mark complete if already marked", async () => {
      repository.query.mockResolvedValue([{ affected: 1 }]);
      const userAlreadyComplete = {
        ...mockUser,
        scanProgress: 100,
        scanTotal: 100,
        hasScannedHistory: true,
      };
      repository.findOne.mockResolvedValue(userAlreadyComplete);

      const result = await service.incrementScanProgress("user-1");

      expect(result.isComplete).toBe(true);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("should return zero progress if user not found after increment", async () => {
      repository.query.mockResolvedValue([{ affected: 1 }]);
      repository.findOne.mockResolvedValue(null);

      const result = await service.incrementScanProgress("user-1");

      expect(result).toEqual({
        scanProgress: 0,
        scanTotal: 0,
        isComplete: false,
      });
    });

    it("should not mark complete if scanTotal is 0", async () => {
      repository.query.mockResolvedValue([{ affected: 1 }]);
      const userNoTotal = { ...mockUser, scanProgress: 0, scanTotal: 0 };
      repository.findOne.mockResolvedValue(userNoTotal);

      const result = await service.incrementScanProgress("user-1");

      expect(result.isComplete).toBe(false);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("acceptConsent", () => {
    beforeEach(() => {
      process.env.TERMS_VERSION = "2.0.0";
      process.env.PRIVACY_VERSION = "2.0.0";
    });

    it("should accept terms and privacy", async () => {
      const userWithConsent = {
        ...mockUser,
        termsAcceptedAt: new Date(),
        termsVersion: "2.0.0",
        privacyAcceptedAt: new Date(),
        privacyVersion: "2.0.0",
      };
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      repository.findOne.mockResolvedValue(userWithConsent);

      const result = await service.acceptConsent("user-1", true, true);

      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          termsAcceptedAt: expect.any(Date),
          termsVersion: "2.0.0",
          privacyAcceptedAt: expect.any(Date),
          privacyVersion: "2.0.0",
        }),
      );
      expect(result).toEqual(userWithConsent);
    });

    it("should accept only terms", async () => {
      const userWithTerms = {
        ...mockUser,
        termsAcceptedAt: new Date(),
        termsVersion: "2.0.0",
      };
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      repository.findOne.mockResolvedValue(userWithTerms);

      await service.acceptConsent("user-1", true, false);

      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          termsAcceptedAt: expect.any(Date),
          termsVersion: "2.0.0",
        }),
      );
      expect(repository.update).not.toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          privacyAcceptedAt: expect.any(Date),
        }),
      );
    });

    it("should accept only privacy", async () => {
      const userWithPrivacy = {
        ...mockUser,
        privacyAcceptedAt: new Date(),
        privacyVersion: "2.0.0",
      };
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      repository.findOne.mockResolvedValue(userWithPrivacy);

      await service.acceptConsent("user-1", false, true);

      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          privacyAcceptedAt: expect.any(Date),
          privacyVersion: "2.0.0",
        }),
      );
    });
  });

  describe("getConsentStatus", () => {
    beforeEach(() => {
      process.env.TERMS_VERSION = "2.0.0";
      process.env.PRIVACY_VERSION = "2.0.0";
    });

    it("should return needs acceptance when user has not accepted", async () => {
      const userNoConsent = {
        ...mockUser,
        termsAcceptedAt: null,
        privacyAcceptedAt: null,
      };
      repository.findOne.mockResolvedValue(userNoConsent);

      const result = await service.getConsentStatus("user-1");

      expect(result.needsTermsAcceptance).toBe(true);
      expect(result.needsPrivacyAcceptance).toBe(true);
    });

    it("should return needs acceptance when version mismatch", async () => {
      const userOldVersion = {
        ...mockUser,
        termsAcceptedAt: new Date(),
        termsVersion: "1.0.0",
        privacyAcceptedAt: new Date(),
        privacyVersion: "1.0.0",
      };
      repository.findOne.mockResolvedValue(userOldVersion);

      const result = await service.getConsentStatus("user-1");

      expect(result.needsTermsAcceptance).toBe(true);
      expect(result.needsPrivacyAcceptance).toBe(true);
    });

    it("should return no needs acceptance when up to date", async () => {
      const userUpToDate = {
        ...mockUser,
        termsAcceptedAt: new Date(),
        termsVersion: "2.0.0",
        privacyAcceptedAt: new Date(),
        privacyVersion: "2.0.0",
      };
      repository.findOne.mockResolvedValue(userUpToDate);

      const result = await service.getConsentStatus("user-1");

      expect(result.needsTermsAcceptance).toBe(false);
      expect(result.needsPrivacyAcceptance).toBe(false);
      expect(result.termsVersion).toBe("2.0.0");
      expect(result.privacyVersion).toBe("2.0.0");
      expect(result.currentTermsVersion).toBe("2.0.0");
      expect(result.currentPrivacyVersion).toBe("2.0.0");
    });

    it("should throw error if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.getConsentStatus("nonexistent")).rejects.toThrow(
        "User not found",
      );
    });

    it("should use default versions when env vars not set", async () => {
      delete process.env.TERMS_VERSION;
      delete process.env.PRIVACY_VERSION;

      const userUpToDate = {
        ...mockUser,
        termsAcceptedAt: new Date(),
        termsVersion: "1.0.0",
        privacyAcceptedAt: new Date(),
        privacyVersion: "1.0.0",
      };
      repository.findOne.mockResolvedValue(userUpToDate);

      const result = await service.getConsentStatus("user-1");

      expect(result.currentTermsVersion).toBe("1.0.0");
      expect(result.currentPrivacyVersion).toBe("1.0.0");
      expect(result.needsTermsAcceptance).toBe(false);
      expect(result.needsPrivacyAcceptance).toBe(false);
    });
  });

  describe("hashEmail", () => {
    it("should delegate to EncryptionHelper.hashEmail", () => {
      const result = service.hashEmail("test@example.com");
      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(result).toBe("hash_test@example.com");
    });
  });

  describe("findUsersForDeletion", () => {
    it("returns user IDs from the raw query result", async () => {
      repository.query.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);

      const result = await service.findUsersForDeletion(30);

      expect(result).toEqual(["user-1", "user-2"]);
    });

    it("passes a threshold date computed from the given retention days", async () => {
      repository.query.mockResolvedValue([]);
      const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await service.findUsersForDeletion(30);

      const after = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const calledWith: Date = repository.query.mock.calls[0][1][0];
      expect(calledWith.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(calledWith.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    });

    it("uses COALESCE and excludes admins in the SQL query", async () => {
      repository.query.mockResolvedValue([]);

      await service.findUsersForDeletion(30);

      const sql: string = repository.query.mock.calls[0][0];
      expect(sql).toContain("COALESCE");
      expect(sql).toContain("lastActivityAt");
      expect(sql).toContain("createdAt");
      expect(sql).toContain('"isAdmin" = false');
    });

    it("returns an empty array when no users are eligible", async () => {
      repository.query.mockResolvedValue([]);

      const result = await service.findUsersForDeletion(30);

      expect(result).toEqual([]);
    });
  });

  describe("findDeletedAccountByEmailHash", () => {
    it("should return deleted account record when found", async () => {
      const mockDeleted = {
        id: "del-1",
        emailHash: "some-hash",
        passwordHash: "bcrypt-hash",
        deletionReason: DeletionReason.INACTIVITY,
        deletedAt: new Date(),
      } as DeletedAccount;
      deletedAccountRepository.findOne.mockResolvedValue(mockDeleted);

      const result = await service.findDeletedAccountByEmailHash("some-hash");

      expect(deletedAccountRepository.findOne).toHaveBeenCalledWith({
        where: { emailHash: "some-hash" },
      });
      expect(result).toEqual(mockDeleted);
    });

    it("should return null when no deleted account found", async () => {
      deletedAccountRepository.findOne.mockResolvedValue(null);

      const result =
        await service.findDeletedAccountByEmailHash("unknown-hash");

      expect(result).toBeNull();
    });
  });

  describe("deleteAccount", () => {
    it("should save a tombstone to deleted_accounts before deleting", async () => {
      const userWithPassword = {
        ...mockUser,
        emailHash: "hash_test@example.com",
        password: "bcrypt-hash",
      } as User;
      // findOne is called twice: once in deleteAccount, once in deleteAccount chain
      repository.findOne.mockResolvedValue(userWithPassword);
      repository.query.mockResolvedValue([]);
      repository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.deleteAccount("user-1", DeletionReason.INACTIVITY);

      expect(deletedAccountRepository.upsert).toHaveBeenCalledWith(
        {
          emailHash: "hash_test@example.com",
          passwordHash: "bcrypt-hash",
          deletionReason: DeletionReason.INACTIVITY,
        },
        { conflictPaths: ["emailHash"] },
      );
      expect(repository.delete).toHaveBeenCalledWith("user-1");
    });

    it("should default to MANUAL deletion reason", async () => {
      const userWithPassword = {
        ...mockUser,
        emailHash: "hash_test@example.com",
        password: "bcrypt-hash",
      } as User;
      repository.findOne.mockResolvedValue(userWithPassword);
      repository.query.mockResolvedValue([]);
      repository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.deleteAccount("user-1");

      expect(deletedAccountRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ deletionReason: DeletionReason.MANUAL }),
        expect.anything(),
      );
    });

    it("should skip upsert when user has no emailHash", async () => {
      const userNoHash = {
        ...mockUser,
        emailHash: null,
        password: "bcrypt-hash",
      } as unknown as User;
      repository.findOne.mockResolvedValue(userNoHash);
      repository.query.mockResolvedValue([]);
      repository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.deleteAccount("user-1");

      expect(deletedAccountRepository.upsert).not.toHaveBeenCalled();
    });
  });
});
