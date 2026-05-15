import { DataSource } from "typeorm";

import { EncryptionHelper } from "./encryption.helper";
import {
  verifyEncryptionRoundTrip,
  verifyExistingDataDecryption,
} from "./encryption-boot-check";
import { encryptionKeyProvider } from "./encryption-key-provider";

describe("encryption-boot-check", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;
  const originalKmsId = process.env.KMS_KEY_ID;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!!";
    encryptionKeyProvider.initialize();
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    if (originalKmsId) {
      process.env.KMS_KEY_ID = originalKmsId;
    } else {
      delete process.env.KMS_KEY_ID;
    }
  });

  describe("verifyEncryptionRoundTrip", () => {
    it("passes when the key can encrypt and decrypt", () => {
      expect(() => verifyEncryptionRoundTrip()).not.toThrow();
    });
  });

  describe("verifyExistingDataDecryption", () => {
    function makeDataSource(
      handler: (sql: string) => Promise<unknown>,
    ): DataSource {
      return { query: jest.fn(handler) } as unknown as DataSource;
    }

    it("skips when the users table query throws (table not yet migrated)", async () => {
      const ds = makeDataSource(async () => {
        throw new Error('relation "users" does not exist');
      });
      await expect(verifyExistingDataDecryption(ds)).resolves.toBeUndefined();
    });

    it("skips when the users table is empty (fresh database)", async () => {
      const ds = makeDataSource(async () => []);
      await expect(verifyExistingDataDecryption(ds)).resolves.toBeUndefined();
    });

    it("succeeds when the row decrypts with the global key", async () => {
      const ciphertext =
        EncryptionHelper.encryptWithGlobalKey("user@example.com");
      const ds = makeDataSource(async () => [{ email: ciphertext }]);
      await expect(verifyExistingDataDecryption(ds)).resolves.toBeUndefined();
    });

    it("succeeds even when KMS_KEY_ID is set (no user context at boot)", async () => {
      // Regression: with KMS envelope encryption enabled, getKey() prefers a
      // per-user key when one is in AsyncLocalStorage. At boot there is no user
      // context, so the check must rely on the global key — which is what
      // users.email is encrypted with.
      process.env.KMS_KEY_ID = "arn:aws:kms:test:000000000000:key/test";
      const ciphertext =
        EncryptionHelper.encryptWithGlobalKey("user@example.com");
      const ds = makeDataSource(async () => [{ email: ciphertext }]);
      await expect(verifyExistingDataDecryption(ds)).resolves.toBeUndefined();
    });

    it("throws FATAL when the row was encrypted with a different key", async () => {
      // Encrypt with one key, then re-initialise with a different one before checking.
      const ciphertext =
        EncryptionHelper.encryptWithGlobalKey("user@example.com");
      process.env.ENCRYPTION_KEY = "different-key-32-characters-long!!";
      encryptionKeyProvider.initialize();
      const ds = makeDataSource(async () => [{ email: ciphertext }]);
      await expect(verifyExistingDataDecryption(ds)).rejects.toThrow(
        /FATAL: Cannot decrypt existing database rows/,
      );
    });

    it("does not crash when the row is stored as plaintext (data-integrity warn)", async () => {
      const ds = makeDataSource(async () => [
        { email: "plaintext@example.com" },
      ]);
      await expect(verifyExistingDataDecryption(ds)).resolves.toBeUndefined();
    });
  });
});
