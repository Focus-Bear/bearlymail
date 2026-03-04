import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "./users.service";

jest.mock("../encryption/encryption.helper", () => ({
  EncryptionHelper: {
    hashEmail: jest.fn((email: string) => `hash_${email.toLowerCase()}`),
  },
}));

jest.mock("../auth/auth-logger", () => ({
  writeDebugLog: jest.fn(),
}));

describe("UsersService", () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

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
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
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
      repository.update.mockResolvedValue({ affected: 1 } as any);

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
      repository.update.mockResolvedValue({ affected: 1 } as any);
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
      repository.update.mockResolvedValue({ affected: 1 } as any);
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
      repository.update.mockResolvedValue({ affected: 1 } as any);
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
});
