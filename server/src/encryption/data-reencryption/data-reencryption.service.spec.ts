import * as crypto from "crypto";
import { DataSource, Repository } from "typeorm";

import { User } from "../../database/entities/user.entity";
import {
  encryptedColumnTransformer,
  EncryptionHelper,
} from "../encryption.helper";
import { encryptionKeyProvider } from "../encryption-key-provider";
import { KmsEncryptionService } from "../kms-encryption.service";
import { UserEncryptionService } from "../user-encryption.service";
import { runWithUserKey } from "../user-encryption-context";
import { DataReencryptionService } from "./data-reencryption.service";

function deriveKey(material: string): Buffer {
  return crypto.scryptSync(material, "salt", 32);
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    key,
    iv,
  ) as crypto.CipherGCM;
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc}`;
}

describe("DataReencryptionService", () => {
  let service: DataReencryptionService;
  let dataSource: jest.Mocked<DataSource>;
  let userRepo: jest.Mocked<Repository<User>>;
  let userEncryption: jest.Mocked<UserEncryptionService>;
  let kmsService: jest.Mocked<KmsEncryptionService>;
  let txQueryMock: jest.Mock;

  const userId = "user-123";
  const globalKey = deriveKey("test-encryption-key-32-chars-long!!");
  const userKey = Buffer.alloc(32, 0xab);

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!!";
    process.env.KMS_KEY_ID =
      "arn:aws:kms:ap-southeast-2:000000000000:key/test-key";
    encryptionKeyProvider.initialize();

    txQueryMock = jest.fn();

    dataSource = {
      entityMetadatas: [
        {
          tableName: "private_notes",
          primaryColumns: [{ databaseName: "id" }],
          columns: [
            { databaseName: "id", propertyName: "id", transformer: undefined },
            {
              databaseName: "userId",
              propertyName: "userId",
              transformer: undefined,
            },
            {
              databaseName: "content",
              propertyName: "content",
              transformer: encryptedColumnTransformer,
            },
          ],
        },
      ],
      transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        const callback = cb as (mgr: { query: jest.Mock }) => Promise<unknown>;
        return callback({ query: txQueryMock });
      }),
    } as unknown as jest.Mocked<DataSource>;

    userRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<User>>;

    userEncryption = {
      getUserKey: jest.fn().mockResolvedValue(userKey),
    } as unknown as jest.Mocked<UserEncryptionService>;

    kmsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<KmsEncryptionService>;

    service = new DataReencryptionService(
      dataSource,
      userRepo,
      userEncryption,
      kmsService,
    );
  });

  afterEach(() => {
    delete process.env.KMS_KEY_ID;
  });

  it("throws when KMS is disabled", async () => {
    kmsService.isEnabled.mockReturnValue(false);
    await expect(service.reencryptUser(userId)).rejects.toThrow(/KMS/);
  });

  it("discovers the test table", () => {
    expect(service.getTables()).toHaveLength(1);
    expect(service.getTables()[0].tableName).toBe("private_notes");
    expect(
      service.getTables()[0].columns.map((col) => col.databaseName),
    ).toEqual(["content"]);
  });

  it("re-encrypts a row whose ciphertext was written under the global key", async () => {
    const legacyCiphertext = encryptWithKey("hello world", globalKey);

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve([{ id: "row-1", content: legacyCiphertext }]);
      }
      return Promise.resolve([]);
    });

    await service.reencryptUser(userId);

    const updateCall = txQueryMock.mock.calls.find(([sql]) =>
      /^\s*UPDATE\s/i.test(String(sql)),
    );
    expect(updateCall).toBeDefined();
    const [, params] = updateCall!;
    const newCiphertext = (params as string[])[0];
    // Re-encrypted under user key — global-key decrypt should fail, user-key should succeed
    expect(newCiphertext).not.toBe(legacyCiphertext);
    await runWithUserKey(userKey, async () => {
      expect(EncryptionHelper.decrypt(newCiphertext)).toBe("hello world");
    });
  });

  it("skips a row already encrypted under the user key", async () => {
    const userKeyCiphertext = encryptWithKey("already migrated", userKey);

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve([{ id: "row-1", content: userKeyCiphertext }]);
      }
      return Promise.resolve([]);
    });

    await service.reencryptUser(userId);

    const updateCalls = txQueryMock.mock.calls.filter(([sql]) =>
      /^\s*UPDATE\s/i.test(String(sql)),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("skips writes in dry-run mode but still scans rows", async () => {
    const legacyCiphertext = encryptWithKey("dry run data", globalKey);

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve([{ id: "row-1", content: legacyCiphertext }]);
      }
      return Promise.resolve([]);
    });

    const result = await service.reencryptUser(userId, { dryRun: true });

    expect(
      txQueryMock.mock.calls.some(([sql]) => /^\s*UPDATE\s/i.test(String(sql))),
    ).toBe(false);
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.tables[0].rowsRewritten).toBe(1);
  });

  it("marks user as re-encrypted after a non-dry-run completes", async () => {
    txQueryMock.mockResolvedValue([]);
    await service.reencryptUser(userId);
    expect(userRepo.update).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ dataReencryptedAt: expect.any(Date) }),
    );
  });

  it("does NOT mark user complete when any row fails to decrypt", async () => {
    // A ciphertext encrypted under a key that's neither the user nor global key.
    // Both silent decrypts will return null, classifying it as failed.
    const orphanedKey = Buffer.alloc(32, 0xcd);
    const orphanedCiphertext = encryptWithKey("unrecoverable", orphanedKey);

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve([{ id: "row-1", content: orphanedCiphertext }]);
      }
      return Promise.resolve([]);
    });

    const result = await service.reencryptUser(userId);

    expect(result.tables[0].rowsFailed).toBe(1);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it("captures structured failure diagnostics for unrecoverable rows", async () => {
    const orphanedKey = Buffer.alloc(32, 0xcd);
    const orphanedCiphertext = encryptWithKey("unrecoverable", orphanedKey);

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve([
          { id: "row-1", content: orphanedCiphertext },
          { id: "row-2", content: orphanedCiphertext },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.reencryptUser(userId, { dryRun: true });

    expect(result.tables[0].rowsFailed).toBe(2);
    expect(result.tables[0].failures).toHaveLength(2);

    const [first] = result.tables[0].failures;
    expect(first.table).toBe("private_notes");
    expect(first.rowId).toBe("row-1");
    expect(first.column).toBe("content");
    expect(first.reason).toBe("neither_key");
    // The encryptWithKey helper above uses a 16-byte IV (32 hex chars) and
    // GCM auth tag (16 bytes = 32 hex chars). Body hex length depends on
    // plaintext but must be even and non-zero.
    expect(first.ivHexLen).toBe(32);
    expect(first.tagHexLen).toBe(32);
    expect(first.bodyHexLen).toBeGreaterThan(0);
    expect(first.bodyHexLen % 2).toBe(0);
    expect(first.totalLen).toBe(orphanedCiphertext.length);
    expect(first.prefix.length).toBe(12);
    expect(first.suffix.length).toBe(12);
    expect(first.errorMessage).toContain("neither");
  });

  it("caps retained failure details to MAX_FAILURES_RETAINED_PER_TABLE", async () => {
    // Verify failures array is bounded even if every row fails. Simulate
    // 25 failed rows; cap is 20 (see MAX_FAILURES_RETAINED_PER_TABLE).
    const orphanedKey = Buffer.alloc(32, 0xcd);
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `row-${i}`,
      content: encryptWithKey(`payload-${i}`, orphanedKey),
    }));

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return Promise.resolve(rows);
      }
      return Promise.resolve([]);
    });

    const result = await service.reencryptUser(userId, { dryRun: true });

    expect(result.tables[0].rowsFailed).toBe(25);
    expect(result.tables[0].failures.length).toBeLessThanOrEqual(20);
  });
});
