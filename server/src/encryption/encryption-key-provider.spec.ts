import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { encryptionKeyProvider } from "./encryption-key-provider";

/**
 * The provider is a module-level singleton, so each test sets the env it needs
 * and re-initializes. We snapshot/restore the relevant env vars around each.
 */
describe("EncryptionKeyProvider", () => {
  const ENV_KEYS = [
    "ENCRYPTION_KEY",
    "KMS_KEY_ID",
    "ENCRYPTION_KEY_KMS_BLOB",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  const TEST_KEY = "test-encryption-key-32-chars-long!!";
  // The exact 32 bytes initialize() derives from TEST_KEY.
  const derivedFromTestKey = crypto.scryptSync(
    TEST_KEY,
    "salt",
    ENCRYPTION_CONSTANTS.KEY_LENGTH,
  );
  const expectedFingerprint = crypto
    .createHash("sha256")
    .update(derivedFromTestKey)
    .digest("hex")
    .slice(0, ENCRYPTION_CONSTANTS.FINGERPRINT_LENGTH);

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe("initialize() (static env path)", () => {
    it("derives the key from ENCRYPTION_KEY and reports source static-env", () => {
      process.env.ENCRYPTION_KEY = TEST_KEY;

      encryptionKeyProvider.initialize();

      expect(encryptionKeyProvider.isInitialized()).toBe(true);
      expect(encryptionKeyProvider.getKeySource()).toBe("static-env");
      expect(encryptionKeyProvider.getFingerprint()).toBe(expectedFingerprint);
    });

    it("throws when ENCRYPTION_KEY is absent", () => {
      expect(() => encryptionKeyProvider.initialize()).toThrow(
        /ENCRYPTION_KEY/,
      );
    });
  });

  describe("initializeFromManagedKey()", () => {
    it("falls back to the static env key when no KMS blob is configured", async () => {
      process.env.ENCRYPTION_KEY = TEST_KEY;
      // KMS_KEY_ID present but no blob → still the static path.
      process.env.KMS_KEY_ID = "arn:aws:kms:ap-southeast-2:0:key/abc";

      const kmsDecrypt = jest.fn();
      await encryptionKeyProvider.initializeFromManagedKey(kmsDecrypt);

      expect(kmsDecrypt).not.toHaveBeenCalled();
      expect(encryptionKeyProvider.getKeySource()).toBe("static-env");
      expect(encryptionKeyProvider.getFingerprint()).toBe(expectedFingerprint);
    });

    it("uses the KMS-decrypted blob when KMS_KEY_ID + blob are set, with no static key needed", async () => {
      // No ENCRYPTION_KEY at all — proves the static secret is no longer required.
      process.env.KMS_KEY_ID = "arn:aws:kms:ap-southeast-2:0:key/abc";
      process.env.ENCRYPTION_KEY_KMS_BLOB =
        Buffer.from("wrapped-blob").toString("base64");

      // The KMS path wraps the *same* derived bytes, so the fingerprint must
      // match the static path — this is what ops verify before dropping the
      // static key.
      const kmsDecrypt = jest
        .fn()
        .mockResolvedValue(Buffer.from(derivedFromTestKey));

      await encryptionKeyProvider.initializeFromManagedKey(kmsDecrypt);

      expect(kmsDecrypt).toHaveBeenCalledTimes(1);
      // It received the decoded blob bytes, not the base64 string.
      expect(kmsDecrypt.mock.calls[0][0]).toEqual(Buffer.from("wrapped-blob"));
      expect(encryptionKeyProvider.getKeySource()).toBe("kms");
      expect(encryptionKeyProvider.getFingerprint()).toBe(expectedFingerprint);
    });

    it("rejects a KMS-decrypted key of the wrong length", async () => {
      process.env.KMS_KEY_ID = "arn:aws:kms:ap-southeast-2:0:key/abc";
      process.env.ENCRYPTION_KEY_KMS_BLOB =
        Buffer.from("wrapped-blob").toString("base64");

      // 16 bytes, not the required 32.
      const kmsDecrypt = jest.fn().mockResolvedValue(Buffer.alloc(16));

      await expect(
        encryptionKeyProvider.initializeFromManagedKey(kmsDecrypt),
      ).rejects.toThrow(/expected 32/);
    });
  });
});
