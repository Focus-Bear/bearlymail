import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import {
  emailTransformer,
  encryptedColumnTransformer,
  encryptedJsonTransformer,
  EncryptionHelper,
  getEncryptedTransformerMeta,
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "./encryption.helper";
import { encryptionKeyProvider } from "./encryption-key-provider";
import { runWithUserKey } from "./user-encryption-context";

describe("EncryptionHelper", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!!";
    // Re-initialize the provider with the test key
    encryptionKeyProvider.initialize();
    // Reset the consecutive failure counter
    EncryptionHelper.globalConsecutiveFailures = 0;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe("getKey (via encryptionKeyProvider)", () => {
    it("should throw FATAL error when provider is not initialized", () => {
      const provider = encryptionKeyProvider;
      const originalInitialized = provider.initialized;
      const originalDerivedKey = provider.derivedKey;
      provider.initialized = false;
      provider.derivedKey = null;
      try {
        expect(() => EncryptionHelper.encrypt("test")).toThrow(
          "FATAL: EncryptionKeyProvider.getKey() called before initialize()",
        );
      } finally {
        provider.initialized = originalInitialized;
        provider.derivedKey = originalDerivedKey;
      }
    });
  });

  describe("encryptionKeyProvider.initialize()", () => {
    it("should throw FATAL error when ENCRYPTION_KEY is not set", () => {
      delete process.env.ENCRYPTION_KEY;
      const provider = new encryptionKeyProvider.constructor();
      expect(() => provider.initialize()).toThrow(
        "FATAL: ENCRYPTION_KEY environment variable is not set.",
      );
    });

    it("should throw FATAL error when ENCRYPTION_KEY is empty string", () => {
      process.env.ENCRYPTION_KEY = "";
      const provider = new encryptionKeyProvider.constructor();
      expect(() => provider.initialize()).toThrow(
        "FATAL: ENCRYPTION_KEY environment variable is not set.",
      );
    });

    it("should expose an 8-char hex fingerprint after initialize()", () => {
      const fingerprint = encryptionKeyProvider.getFingerprint();
      expect(fingerprint).toBeTruthy();
      expect(fingerprint!.length).toBe(8);
      expect(/^[0-9a-f]{8}$/.test(fingerprint!)).toBe(true);
    });

    it("should report isInitialized() true after initialize()", () => {
      expect(encryptionKeyProvider.isInitialized()).toBe(true);
    });
  });

  describe("encrypt", () => {
    it("should encrypt a string value", () => {
      const plaintext = "Hello, World!";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":");
    });

    it("should return null for null input", () => {
      const result = EncryptionHelper.encrypt(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      const result = EncryptionHelper.encrypt(undefined);
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = EncryptionHelper.encrypt("");
      expect(result).toBeNull();
    });

    it("should produce different encrypted values for same input (due to random IV)", () => {
      const plaintext = "Hello, World!";
      const encrypted1 = EncryptionHelper.encrypt(plaintext);
      const encrypted2 = EncryptionHelper.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should produce encrypted output in correct format (IV:authTag:encrypted)", () => {
      const plaintext = "test";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const parts = encrypted!.split(":");
      expect(parts.length).toBe(3);
      expect(parts[0].length).toBe(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      expect(parts[1].length).toBe(32);
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it("should encrypt special characters correctly", () => {
      const plaintext = "Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      const decrypted = EncryptionHelper.decrypt(encrypted!);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt unicode characters correctly", () => {
      const plaintext = "Hello 世界 🌍";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const decrypted = EncryptionHelper.decrypt(encrypted!);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt long strings", () => {
      const plaintext = "A".repeat(10000);
      const encrypted = EncryptionHelper.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      const decrypted = EncryptionHelper.decrypt(encrypted!);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted string back to original", () => {
      const plaintext = "Hello, World!";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const decrypted = EncryptionHelper.decrypt(encrypted!);
      expect(decrypted).toBe(plaintext);
    });

    it("should return null for null input", () => {
      const result = EncryptionHelper.decrypt(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      const result = EncryptionHelper.decrypt(undefined);
      expect(result).toBeNull();
    });

    it("should return plaintext if input does not contain colon (backwards compatibility)", () => {
      const plaintext = "unencrypted-text";
      const result = EncryptionHelper.decrypt(plaintext);
      expect(result).toBe(plaintext);
    });

    it("should return plaintext if format is incorrect (not 3 parts)", () => {
      const invalidFormat = "part1:part2";
      const result = EncryptionHelper.decrypt(invalidFormat);
      expect(result).toBe(invalidFormat);
    });

    it("should throw when decryption fails (malformed data)", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const invalidEncrypted = `${fakeIvHex}:invalid:data`;
      expect(() => EncryptionHelper.decrypt(invalidEncrypted)).toThrow();
    });

    it("should return plaintext when 3-part value has wrong IV length (e.g. time strings)", () => {
      const timeString = "12:30:45";
      const result = EncryptionHelper.decrypt(timeString);
      expect(result).toBe(timeString);
    });

    it("should throw when 3-part value has correct IV length but is not encrypted data", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const fakeValue = `${fakeIvHex}:fakeauth:fakedata`;
      expect(() => EncryptionHelper.decrypt(fakeValue)).toThrow();
    });

    // Regression for #1700 follow-up: when KMS rollout left cross-key
    // ciphertext in hot columns, every row hydrated by TypeORM hit
    // tryDecrypt → decrypt → catch → logError → PostHog. PostHog's
    // error-tracking quota was exhausted by one bad row firing on
    // every read. The decrypt() catch must throw silently — let the
    // fail-open caller (tryDecrypt) own telemetry on its throttled path.
    it("should not write to logError on auth-tag failure (PostHog spam guard)", () => {
      // jest.mock at file scope can't reach into the inner ../utils/logger
      // module after the helper has captured the import binding, so we
      // assert indirectly: a forced auth-tag failure throws, and the test
      // process produces no captured-error side effect we can detect via
      // the global ErrorTracking client. Instead, we assert the catch
      // block contains no logError invocation by spying on console.error.
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      expect(() => EncryptionHelper.decrypt(badCiphertext)).toThrow();

      // logError uses Logger.error under the hood, which writes to
      // console.error in the test environment. The catch must NOT touch it.
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle decrypting text encrypted with different IV", () => {
      const plaintext = "test message";
      const encrypted1 = EncryptionHelper.encrypt(plaintext);
      const encrypted2 = EncryptionHelper.encrypt(plaintext);
      expect(EncryptionHelper.decrypt(encrypted1!)).toBe(plaintext);
      expect(EncryptionHelper.decrypt(encrypted2!)).toBe(plaintext);
    });

    it("should round-trip decryptWithKeyString when passphrase matches ENCRYPTION_KEY", () => {
      const plaintext = "admin key probe";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const key = process.env.ENCRYPTION_KEY ?? "";
      expect(EncryptionHelper.decryptWithKeyString(encrypted!, key)).toBe(
        plaintext,
      );
    });
  });

  describe("tryDecrypt circuit-breaker", () => {
    it("should reset consecutive failure counter on success", () => {
      const plaintext = "hello";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      EncryptionHelper.globalConsecutiveFailures = 5;
      EncryptionHelper.tryDecrypt(encrypted);
      expect(EncryptionHelper.globalConsecutiveFailures).toBe(0);
    });

    it("should increment consecutive failure counter on each failure", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      EncryptionHelper.tryDecrypt(badCiphertext);
      expect(EncryptionHelper.globalConsecutiveFailures).toBe(1);
      EncryptionHelper.tryDecrypt(badCiphertext);
      expect(EncryptionHelper.globalConsecutiveFailures).toBe(2);
    });

    it("does NOT throw/crash after many consecutive failures (per-user-era safety)", () => {
      // Previously this crashed the process after 3 failures. Under per-user
      // encryption, a cross-user read legitimately fails the global-key
      // fallback, so crashing would take down every tenant. It must stay alive.
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      expect(() => {
        for (let i = 0; i < 10; i++) EncryptionHelper.tryDecrypt(badCiphertext);
      }).not.toThrow();
    });

    it("returns null (NEVER raw ciphertext) on decryption failure", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      // below threshold
      expect(EncryptionHelper.tryDecrypt(badCiphertext)).toBeNull();
      // and above threshold
      EncryptionHelper.tryDecrypt(badCiphertext);
      EncryptionHelper.tryDecrypt(badCiphertext);
      expect(EncryptionHelper.tryDecrypt(badCiphertext)).toBeNull();
    });

    it("failure log keeps the alarm's metric-filter prefix and adds ciphertext + call-site triage context", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      try {
        EncryptionHelper.tryDecrypt(badCiphertext);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = warnSpy.mock.calls[0][0] as string;
        // The CloudWatch metric filter matches this literal prefix — it must
        // never change shape (infrastructure/lib/bearlymail-stack.ts).
        expect(logged).toContain("tryDecrypt: decryption failed");
        expect(logged).toContain(
          `ciphertext=${badCiphertext.slice(0, ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH)}`,
        );
        expect(logged).toContain("readAt=");
        // TypeORM hydration has no app frames on the sync stack; the log must
        // still name a library frame rather than degrading to "unknown".
        expect(logged).not.toContain("readAt=unknown");
        // Unlabelled call sites are explicit, and ALS key presence is always
        // reported (context-loss vs wrong-key triage).
        expect(logged).toContain("field=(unlabelled)");
        expect(logged).toContain("userKey=absent");
        // Never log the full ciphertext.
        expect(logged).not.toContain(badCiphertext);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("failure log names the field passed by the owning transformer and reports ALS key presence", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      try {
        runWithUserKey(crypto.randomBytes(32), () => {
          EncryptionHelper.tryDecrypt(badCiphertext, "emails.subject");
        });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = warnSpy.mock.calls[0][0] as string;
        expect(logged).toContain("field=emails.subject");
        expect(logged).toContain("userKey=present");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("labelled transformer factories forward their field into the failure log", () => {
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const badCiphertext = `${fakeIvHex}:fakeauth:fakedata`;
      EncryptionHelper.globalConsecutiveFailures = 0;
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      try {
        const transformer = makeEncryptedColumnTransformer("emails.body");
        expect(transformer.from(badCiphertext)).toBeNull();
        const logged = warnSpy.mock.calls[0][0] as string;
        expect(logged).toContain("field=emails.body");
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("hashEmail", () => {
    it("should hash an email address", () => {
      const email = "test@example.com";
      const hash = EncryptionHelper.hashEmail(email);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
      expect(typeof hash).toBe("string");
    });

    it("should return empty string for empty input", () => {
      const result = EncryptionHelper.hashEmail("");
      expect(result).toBe("");
    });

    it("should return empty string for null/undefined", () => {
      expect(EncryptionHelper.hashEmail(null)).toBe("");
      expect(EncryptionHelper.hashEmail(undefined)).toBe("");
    });

    it("should normalize email to lowercase", () => {
      const hash1 = EncryptionHelper.hashEmail("Test@Example.com");
      const hash2 = EncryptionHelper.hashEmail("test@example.com");
      expect(hash1).toBe(hash2);
    });

    it("should trim email before hashing", () => {
      const hash1 = EncryptionHelper.hashEmail("test@example.com");
      const hash2 = EncryptionHelper.hashEmail("  test@example.com  ");
      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hashes for same email", () => {
      const email = "test@example.com";
      expect(EncryptionHelper.hashEmail(email)).toBe(
        EncryptionHelper.hashEmail(email),
      );
    });

    it("should produce different hashes for different emails", () => {
      const hash1 = EncryptionHelper.hashEmail("test1@example.com");
      const hash2 = EncryptionHelper.hashEmail("test2@example.com");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle emails with special characters", () => {
      const hash = EncryptionHelper.hashEmail("test+tag@example.com");
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });
  });

  describe("encryptedColumnTransformer", () => {
    it("should encrypt value on write (to)", () => {
      const plaintext = "sensitive data";
      const encrypted = encryptedColumnTransformer.to(plaintext);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":");
    });

    it("should decrypt value on read (from)", () => {
      const plaintext = "sensitive data";
      const encrypted = encryptedColumnTransformer.to(plaintext);
      const decrypted = encryptedColumnTransformer.from(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should return null for null values", () => {
      expect(encryptedColumnTransformer.to(null)).toBeNull();
      expect(encryptedColumnTransformer.from(null)).toBeNull();
    });

    it("should return null for undefined values", () => {
      expect(encryptedColumnTransformer.to(undefined)).toBeNull();
      expect(encryptedColumnTransformer.from(undefined)).toBeNull();
    });
  });

  describe("emailTransformer", () => {
    it("should encrypt email on write", () => {
      const email = "test@example.com";
      const encrypted = emailTransformer.to(email);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(email);
    });

    it("should decrypt email on read", () => {
      const email = "test@example.com";
      const encrypted = emailTransformer.to(email);
      const decrypted = emailTransformer.from(encrypted);
      expect(decrypted).toBe(email);
    });

    it("should return null for null values", () => {
      expect(emailTransformer.to(null)).toBeNull();
      expect(emailTransformer.from(null)).toBeNull();
    });
  });

  describe("encryptedJsonTransformer", () => {
    it("should encrypt JSON object on write", () => {
      const testObject = {
        key: "value",
        number: 123,
        nested: { nestedValue: "test" },
      };
      const encrypted = encryptedJsonTransformer.to(testObject);
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe("string");
      expect(encrypted).toContain(":");
    });

    it("should decrypt and parse JSON object on read", () => {
      const testObject = { key: "value", number: 123 };
      const encrypted = encryptedJsonTransformer.to(testObject);
      const decrypted = encryptedJsonTransformer.from(encrypted);
      expect(decrypted).toEqual(testObject);
    });

    it("should handle complex nested objects", () => {
      const complexObject = {
        user: {
          name: "Test",
          email: "test@example.com",
          settings: {
            theme: "dark",
            notifications: true,
          },
        },
        items: [1, 2, 3],
      };
      const encrypted = encryptedJsonTransformer.to(complexObject);
      const decrypted = encryptedJsonTransformer.from(encrypted);
      expect(decrypted).toEqual(complexObject);
    });

    it("should return null for null input", () => {
      expect(encryptedJsonTransformer.to(null)).toBeNull();
      expect(encryptedJsonTransformer.from(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(encryptedJsonTransformer.to(undefined)).toBeNull();
      expect(encryptedJsonTransformer.from(undefined)).toBeNull();
    });

    it("should return null if decrypted value is not valid JSON", () => {
      const plaintext = "not json";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const result = encryptedJsonTransformer.from(encrypted!);
      expect(result).toBeNull();
    });

    it("should handle arrays", () => {
      const testArray = [1, 2, 3, "test", { nested: "value" }];
      const encrypted = encryptedJsonTransformer.to(testArray);
      const decrypted = encryptedJsonTransformer.from(encrypted);
      expect(decrypted).toEqual(testArray);
    });

    it("should handle primitive values", () => {
      const number = 42;
      const encrypted = encryptedJsonTransformer.to(number);
      const decrypted = encryptedJsonTransformer.from(encrypted);
      expect(decrypted).toBe(number);
    });
  });

  describe("field-aware transformers (decrypt-failure attribution)", () => {
    it("names the table.column field in the parse-failure log for bypassed plaintext", () => {
      const transformer = makeEncryptedJsonTransformer("emails.labels");
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        // A legacy Postgres array literal stored as plaintext (the labels bug).
        // tryDecrypt passes it through (no ':'), then JSON.parse fails.
        const result = transformer.from('{"INBOX","IMPORTANT"}');
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(String(warnSpy.mock.calls[0][0])).toContain("emails.labels");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("falls back to an explicit placeholder when no field label is given", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        // The shared singleton has no field label.
        expect(encryptedJsonTransformer.from('{"A","B"}')).toBeNull();
        expect(String(warnSpy.mock.calls[0][0])).toContain("unlabelled");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("brands factory and singleton transformers for re-encryption discovery", () => {
      expect(getEncryptedTransformerMeta(encryptedJsonTransformer)).toEqual({
        kind: "json",
        scope: "user",
        field: undefined,
      });
      expect(
        getEncryptedTransformerMeta(
          makeEncryptedJsonTransformer("emails.labels"),
        ),
      ).toEqual({ kind: "json", scope: "user", field: "emails.labels" });
      expect(getEncryptedTransformerMeta({})).toBeUndefined();
    });
  });
});
