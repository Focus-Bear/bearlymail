import { Repository } from "typeorm";

import { User } from "../database/entities/user.entity";
import { encryptionKeyProvider } from "./encryption-key-provider";
import { KmsEncryptionService } from "./kms-encryption.service";
import { UserEncryptionService } from "./user-encryption.service";
import { userKeyCache } from "./user-key-cache";

describe("UserEncryptionService", () => {
  let service: UserEncryptionService;
  let kmsService: jest.Mocked<KmsEncryptionService>;
  let userRepo: jest.Mocked<Repository<User>>;

  const userId = "test-user-id";

  function makeSelectQb(resolvedUser: Partial<User> | null) {
    return {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(resolvedUser),
    };
  }

  function makeUpdateQb(affected: number) {
    return {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
  }

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!!";
    encryptionKeyProvider.initialize();

    kmsService = {
      isEnabled: jest.fn().mockReturnValue(false),
      generateDataKey: jest.fn(),
      decryptDataKey: jest.fn(),
    } as unknown as jest.Mocked<KmsEncryptionService>;

    userRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    service = new UserEncryptionService(userRepo, kmsService);
    userKeyCache.invalidate(userId);
  });

  afterEach(() => {
    userKeyCache.invalidate(userId);
  });

  describe("getUserKey() — KMS disabled", () => {
    it("returns global key when KMS is not enabled", async () => {
      kmsService.isEnabled.mockReturnValue(false);
      const key = await service.getUserKey(userId);
      expect(key).toEqual(encryptionKeyProvider.getGlobalKey());
    });
  });

  describe("getUserKey() — KMS enabled", () => {
    const plaintextKey = Buffer.alloc(32, 0xab);
    const encryptedKey = Buffer.from("encrypted-key-blob");

    beforeEach(() => {
      kmsService.isEnabled.mockReturnValue(true);
    });

    it("generates and stores a new key when user has none", async () => {
      userRepo.createQueryBuilder
        .mockReturnValueOnce(
          makeSelectQb({ id: userId, encryptedDataKey: null }) as never,
        )
        .mockReturnValueOnce(makeUpdateQb(1) as never);

      kmsService.generateDataKey.mockResolvedValue({
        plaintextKey,
        encryptedKey,
      });

      const result = await service.getUserKey(userId);

      expect(kmsService.generateDataKey).toHaveBeenCalledTimes(1);
      expect(result).toEqual(plaintextKey);
    });

    it("falls back to existing key when concurrent provisioning wins the race", async () => {
      const storedBase64 = encryptedKey.toString("base64");

      userRepo.createQueryBuilder
        .mockReturnValueOnce(
          makeSelectQb({ id: userId, encryptedDataKey: null }) as never,
        )
        .mockReturnValueOnce(makeUpdateQb(0) as never)
        .mockReturnValueOnce(
          makeSelectQb({ id: userId, encryptedDataKey: storedBase64 }) as never,
        );

      kmsService.generateDataKey.mockResolvedValue({
        plaintextKey,
        encryptedKey,
      });
      kmsService.decryptDataKey.mockResolvedValue(plaintextKey);

      const result = await service.getUserKey(userId);

      expect(kmsService.decryptDataKey).toHaveBeenCalledWith(encryptedKey);
      expect(result).toEqual(plaintextKey);
    });

    it("decrypts existing key from DB", async () => {
      const storedBase64 = encryptedKey.toString("base64");
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQb({ id: userId, encryptedDataKey: storedBase64 }) as never,
      );
      kmsService.decryptDataKey.mockResolvedValue(plaintextKey);

      const result = await service.getUserKey(userId);

      expect(kmsService.decryptDataKey).toHaveBeenCalledWith(encryptedKey);
      expect(result).toEqual(plaintextKey);
    });

    it("returns cached key on second call without hitting DB", async () => {
      userKeyCache.set(userId, plaintextKey);

      const result = await service.getUserKey(userId);

      expect(result).toEqual(plaintextKey);
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("throws when user is not found", async () => {
      userRepo.createQueryBuilder.mockReturnValue(makeSelectQb(null) as never);

      await expect(service.getUserKey(userId)).rejects.toThrow(
        `User ${userId} not found`,
      );
    });

    it("throws (and does NOT fall back to the global key) when KMS Decrypt fails", async () => {
      // Regression guard for #2082 / PR #2185: per-user data is encrypted under
      // the per-user KMS key, so falling back to the global key here would
      // corrupt writes. On a KMS failure we must throw so the job retries.
      const storedBase64 = encryptedKey.toString("base64");
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQb({ id: userId, encryptedDataKey: storedBase64 }) as never,
      );
      kmsService.decryptDataKey.mockRejectedValue(new Error("KMS unavailable"));

      const globalKey = encryptionKeyProvider.getGlobalKey();
      const settled = await service.getUserKey(userId).catch((err) => err);

      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toMatch(/KMS key resolution failed/);
      // It must NOT have silently returned the global key…
      expect(settled).not.toEqual(globalKey);
      // …and nothing should be cached after a failure.
      expect(userKeyCache.get(userId)).toBeNull();
    });

    it("throws when provisioning a new data key fails", async () => {
      userRepo.createQueryBuilder.mockReturnValueOnce(
        makeSelectQb({ id: userId, encryptedDataKey: null }) as never,
      );
      kmsService.generateDataKey.mockRejectedValue(
        new Error("KMS GenerateDataKey failed"),
      );

      await expect(service.getUserKey(userId)).rejects.toThrow(
        /KMS key resolution failed/,
      );
      expect(userKeyCache.get(userId)).toBeNull();
    });
  });

  describe("withUserKey()", () => {
    it("calls task directly when KMS is disabled", async () => {
      kmsService.isEnabled.mockReturnValue(false);
      const task = jest.fn().mockResolvedValue("result");

      const result = await service.withUserKey(userId, task);

      expect(result).toBe("result");
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("wraps task with user key when KMS is enabled", async () => {
      const plaintextKey = Buffer.alloc(32, 0xab);
      const encryptedKey = Buffer.from("encrypted-key-blob");
      const storedBase64 = encryptedKey.toString("base64");

      kmsService.isEnabled.mockReturnValue(true);
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQb({ id: userId, encryptedDataKey: storedBase64 }) as never,
      );
      kmsService.decryptDataKey.mockResolvedValue(plaintextKey);

      const task = jest.fn().mockResolvedValue("wrapped-result");

      const result = await service.withUserKey(userId, task);

      expect(result).toBe("wrapped-result");
      expect(task).toHaveBeenCalledTimes(1);
    });
  });
});
