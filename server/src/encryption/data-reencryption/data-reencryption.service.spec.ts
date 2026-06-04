import * as crypto from "crypto";
import { DataSource, Repository } from "typeorm";

import { User } from "../../database/entities/user.entity";
import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
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

  describe("clearable columns (CLEARABLE_ON_DECRYPT_FAILURE)", () => {
    // Builds a service whose only encrypted column is `emails.summary`, which
    // IS in the clear-on-decrypt-failure allowlist (regenerable LLM cache).
    function buildEmailsSummaryService(): DataReencryptionService {
      const emailsDataSource = {
        entityMetadatas: [
          {
            tableName: "emails",
            primaryColumns: [{ databaseName: "id" }],
            columns: [
              {
                databaseName: "id",
                propertyName: "id",
                transformer: undefined,
              },
              {
                databaseName: "userId",
                propertyName: "userId",
                transformer: undefined,
              },
              {
                databaseName: "summary",
                propertyName: "summary",
                type: "text",
                transformer: encryptedColumnTransformer,
              },
            ],
          },
        ],
        transaction: jest.fn().mockImplementation(async (cb: unknown) => {
          const callback = cb as (mgr: {
            query: jest.Mock;
          }) => Promise<unknown>;
          return callback({ query: txQueryMock });
        }),
      } as unknown as jest.Mocked<DataSource>;

      return new DataReencryptionService(
        emailsDataSource,
        userRepo,
        userEncryption,
        kmsService,
      );
    }

    it("wipes (not fails) an unrecoverable value and marks the user complete", async () => {
      const orphanedKey = Buffer.alloc(32, 0xcd);
      const corruptedSummary = encryptWithKey("corrupted summary", orphanedKey);
      const emailsService = buildEmailsSummaryService();

      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([{ id: "row-1", summary: corruptedSummary }]);
        }
        return Promise.resolve([]);
      });

      const result = await emailsService.reencryptUser(userId);

      // Recovered, not failed — so migration completes for this user.
      expect(result.tables[0].rowsFailed).toBe(0);
      expect(result.tables[0].rowsCleared).toBe(1);
      expect(result.tables[0].rowsRewritten).toBe(1);

      // The UPDATE wipes the column with a literal NULL (not a jsonb null).
      const updateCall = txQueryMock.mock.calls.find(([sql]) =>
        /^\s*UPDATE\s/i.test(String(sql)),
      );
      expect(updateCall).toBeDefined();
      expect(String(updateCall![0])).toContain('"summary" = NULL');

      expect(userRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ dataReencryptedAt: expect.any(Date) }),
      );
    });

    it("counts a clear in dry-run mode without writing", async () => {
      const orphanedKey = Buffer.alloc(32, 0xcd);
      const corruptedSummary = encryptWithKey("corrupted summary", orphanedKey);
      const emailsService = buildEmailsSummaryService();

      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([{ id: "row-1", summary: corruptedSummary }]);
        }
        return Promise.resolve([]);
      });

      const result = await emailsService.reencryptUser(userId, {
        dryRun: true,
      });

      expect(result.tables[0].rowsCleared).toBe(1);
      expect(
        txQueryMock.mock.calls.some(([sql]) =>
          /^\s*UPDATE\s/i.test(String(sql)),
        ),
      ).toBe(false);
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it("still HARD-FAILS an unrecoverable value on a non-allowlisted column", async () => {
      // private_notes.content is NOT clearable — user-authored data must never
      // be silently wiped. The default `service` is wired to private_notes.
      const orphanedKey = Buffer.alloc(32, 0xcd);
      const orphaned = encryptWithKey("user note", orphanedKey);

      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([{ id: "row-1", content: orphaned }]);
        }
        return Promise.resolve([]);
      });

      const result = await service.reencryptUser(userId);

      expect(result.tables[0].rowsFailed).toBe(1);
      expect(result.tables[0].rowsCleared).toBe(0);
      expect(userRepo.update).not.toHaveBeenCalled();
    });
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

  it("JSON-encodes the value when writing to a jsonb column (issue #2132)", async () => {
    // context_analyses.stats is `jsonb` + encryptedJsonTransformer. A raw
    // `SET stats = $1` with a bare ciphertext string is rejected by Postgres
    // ("invalid input syntax for type json") — the actual root cause behind
    // the re-encryption failures. The write must wrap it as `to_jsonb($1::text)`.
    const legacyCiphertext = encryptWithKey("stats blob", globalKey);

    const jsonbDataSource = {
      entityMetadatas: [
        {
          tableName: "context_analyses",
          primaryColumns: [{ databaseName: "id" }],
          columns: [
            { databaseName: "id", propertyName: "id", transformer: undefined },
            {
              databaseName: "userId",
              propertyName: "userId",
              transformer: undefined,
            },
            {
              databaseName: "stats",
              propertyName: "stats",
              type: "jsonb",
              transformer: encryptedJsonTransformer,
            },
          ],
        },
      ],
      transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        const callback = cb as (mgr: { query: jest.Mock }) => Promise<unknown>;
        return callback({ query: txQueryMock });
      }),
    } as unknown as jest.Mocked<DataSource>;

    const jsonbService = new DataReencryptionService(
      jsonbDataSource,
      userRepo,
      userEncryption,
      kmsService,
    );

    txQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        // node-pg parses jsonb, so the SELECT yields the ciphertext string.
        return Promise.resolve([{ id: "row-1", stats: legacyCiphertext }]);
      }
      return Promise.resolve([]);
    });

    await jsonbService.reencryptUser(userId);

    const updateCall = txQueryMock.mock.calls.find(([sql]) =>
      /^\s*UPDATE\s/i.test(String(sql)),
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    // The column is wrapped server-side so the param stays a plain string.
    expect(String(sql)).toContain('"stats" = to_jsonb($1::text)');
    const newCiphertext = (params as string[])[0];
    expect(typeof newCiphertext).toBe("string");
    expect(newCiphertext).not.toBe(legacyCiphertext);
    await runWithUserKey(userKey, async () => {
      expect(EncryptionHelper.decrypt(newCiphertext)).toBe("stats blob");
    });
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

  describe("bypassed plaintext (transformer skipped at write time)", () => {
    // The same emails-with-a-JSON-labels-column harness used to exercise the
    // new pg-array / valid-JSON canonicalisation branch in
    // computeReencryptedColumns. Mirrors buildEmailsSummaryService above.
    function buildJsonLabelsService(): DataReencryptionService {
      const labelsDataSource = {
        entityMetadatas: [
          {
            tableName: "emails",
            primaryColumns: [{ databaseName: "id" }],
            columns: [
              {
                databaseName: "id",
                propertyName: "id",
                transformer: undefined,
              },
              {
                databaseName: "userId",
                propertyName: "userId",
                transformer: undefined,
              },
              {
                databaseName: "labels",
                propertyName: "labels",
                type: "text",
                transformer: encryptedJsonTransformer,
              },
            ],
          },
        ],
        transaction: jest.fn().mockImplementation(async (cb: unknown) => {
          const callback = cb as (mgr: {
            query: jest.Mock;
          }) => Promise<unknown>;
          return callback({ query: txQueryMock });
        }),
      } as unknown as jest.Mocked<DataSource>;

      return new DataReencryptionService(
        labelsDataSource,
        userRepo,
        userEncryption,
        kmsService,
      );
    }

    it("encrypts a bypassed plaintext string column under the per-user key", async () => {
      // private_notes.content is a plain (encryptedColumnTransformer) column;
      // a bypassed write left the plaintext sitting in the column as-is.
      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([
            { id: "row-1", content: "leaked plaintext" },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.reencryptUser(userId);

      expect(result.tables[0].rowsRewritten).toBe(1);
      expect(result.tables[0].rowsFailed).toBe(0);
      const updateCall = txQueryMock.mock.calls.find(([sql]) =>
        /^\s*UPDATE\s/i.test(String(sql)),
      );
      expect(updateCall).toBeDefined();
      const newCiphertext = (updateCall![1] as string[])[0];
      // No longer plaintext, and decryptable under the per-user key.
      expect(newCiphertext).not.toBe("leaked plaintext");
      await runWithUserKey(userKey, async () => {
        expect(EncryptionHelper.decrypt(newCiphertext)).toBe(
          "leaked plaintext",
        );
      });
    });

    it("canonicalises and encrypts a Postgres array-literal labels value", async () => {
      // The exact shape that floods the inbox logs:
      //   `{"INBOX","IMPORTANT"}` (plaintext, bypassed transformer).
      const jsonService = buildJsonLabelsService();
      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([
            { id: "row-1", labels: '{"INBOX","IMPORTANT"}' },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await jsonService.reencryptUser(userId);

      expect(result.tables[0].rowsRewritten).toBe(1);
      expect(result.tables[0].rowsFailed).toBe(0);
      const updateCall = txQueryMock.mock.calls.find(([sql]) =>
        /^\s*UPDATE\s/i.test(String(sql)),
      );
      const stored = (updateCall![1] as string[])[0];
      await runWithUserKey(userKey, async () => {
        // Decrypts to the canonical JSON array form that JSON.parse accepts.
        expect(EncryptionHelper.decrypt(stored)).toBe('["INBOX","IMPORTANT"]');
      });
    });

    it("encrypts an already-valid JSON plaintext as-is", async () => {
      const jsonService = buildJsonLabelsService();
      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([{ id: "row-1", labels: '["FOO","BAR"]' }]);
        }
        return Promise.resolve([]);
      });

      const result = await jsonService.reencryptUser(userId);

      expect(result.tables[0].rowsRewritten).toBe(1);
      const updateCall = txQueryMock.mock.calls.find(([sql]) =>
        /^\s*UPDATE\s/i.test(String(sql)),
      );
      const stored = (updateCall![1] as string[])[0];
      await runWithUserKey(userKey, async () => {
        expect(EncryptionHelper.decrypt(stored)).toBe('["FOO","BAR"]');
      });
    });

    it("records a structured failure for an unrecoverable pg-array of objects ([object Object])", async () => {
      // node-pg serialises an array of OBJECTS to `{"[object Object]",…}` —
      // the original data is gone. labels is NOT clearable, so this must fail
      // loudly rather than silently NULLing user data.
      const jsonService = buildJsonLabelsService();
      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([
            {
              id: "row-1",
              labels: '{"[object Object]","[object Object]"}',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await jsonService.reencryptUser(userId);

      expect(result.tables[0].rowsFailed).toBe(1);
      expect(result.tables[0].failures[0].reason).toBe(
        "bypassed_unrecoverable",
      );
      expect(result.tables[0].failures[0].column).toBe("labels");
      // No UPDATE issued for the unrecoverable column.
      expect(
        txQueryMock.mock.calls.some(([sql]) =>
          /^\s*UPDATE\s/i.test(String(sql)),
        ),
      ).toBe(false);
    });

    it("skips empty / whitespace-only plaintext rather than failing the user (Gemini #2259)", async () => {
      // EncryptionHelper.encrypt returns null for "" — without the empty-skip
      // guard this would surface as a bogus `encrypt_failed` failure and block
      // the user being marked re-encrypted.
      txQueryMock.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([{ id: "row-1", content: "   " }]);
        }
        return Promise.resolve([]);
      });

      const result = await service.reencryptUser(userId);

      expect(result.tables[0].rowsFailed).toBe(0);
      expect(result.tables[0].rowsRewritten).toBe(0);
      expect(
        txQueryMock.mock.calls.some(([sql]) =>
          /^\s*UPDATE\s/i.test(String(sql)),
        ),
      ).toBe(false);
      // User should still be marked complete (no blocking failures).
      expect(userRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ dataReencryptedAt: expect.any(Date) }),
      );
    });
  });

  describe("getHealth", () => {
    function mockHealthQueries(
      tableAgg: Record<string, number>,
      perUser: Array<{ user_id: string; needs: number }>,
    ): jest.Mock {
      const queryMock = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes("rows_needing")) return Promise.resolve([tableAgg]);
        if (sql.includes("GROUP BY")) return Promise.resolve(perUser);
        return Promise.resolve([]);
      });
      (dataSource as unknown as { query: jest.Mock }).query = queryMock;
      return queryMock;
    }

    it("classifies plaintext-at-rest rows and surfaces the real remediation count + top users", async () => {
      // The single test table (private_notes.content): 10 rows, 7 encrypted,
      // 3 plaintext-at-rest (2 of them pg-array literals).
      mockHealthQueries(
        { total: 10, nn_0: 10, enc_0: 7, pg_0: 2, rows_needing: 3 },
        [
          { user_id: "user-a", needs: 2 },
          { user_id: "user-b", needs: 1 },
        ],
      );
      // First count() = jobVisited (dataReencryptedAt IS NOT NULL); second = total.
      (userRepo as unknown as { count: jest.Mock }).count = jest
        .fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(8);

      const health = await service.getHealth();

      expect(health.rowsNeedingRemediation).toBe(3);
      expect(health.scannedTables).toBe(1);
      expect(health.columnsAffected).toBe(1);
      expect(health.byColumn).toHaveLength(1);
      expect(health.byColumn[0]).toMatchObject({
        table: "private_notes",
        column: "content",
        total: 10,
        nonNull: 10,
        encrypted: 7,
        needsRemediation: 3,
        pgArrayLiteral: 2,
      });
      expect(health.topAffectedUsers).toEqual([
        { userId: "user-a", rowsNeedingRemediation: 2 },
        { userId: "user-b", rowsNeedingRemediation: 1 },
      ]);
      expect(health.jobVisitedUsers).toBe(5);
      expect(health.totalUsers).toBe(8);
      expect(health.neverVisitedUsers).toBe(3);
    });

    it("reports zero needing remediation when every value is encrypted-shaped", async () => {
      mockHealthQueries(
        { total: 4, nn_0: 4, enc_0: 4, pg_0: 0, rows_needing: 0 },
        [],
      );
      (userRepo as unknown as { count: jest.Mock }).count = jest
        .fn()
        .mockResolvedValue(2);

      const health = await service.getHealth();

      expect(health.rowsNeedingRemediation).toBe(0);
      expect(health.columnsAffected).toBe(0);
      expect(health.topAffectedUsers).toEqual([]);
      expect(health.byColumn[0].needsRemediation).toBe(0);
    });
  });
});
