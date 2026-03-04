import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import {
  emailTransformer,
  encryptedColumnTransformer,
  encryptedJsonTransformer,
  EncryptionHelper,
} from "./encryption.helper";

describe("EncryptionHelper", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    // Reset key cache before each test
    (EncryptionHelper as any).keyCache = null;
    // Set a test encryption key
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!!";
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    (EncryptionHelper as any).keyCache = null;
  });

  describe("encrypt", () => {
    it("should encrypt a string value", () => {
      const plaintext = "Hello, World!";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      // Format: IV:authTag:encrypted
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
      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should produce encrypted output in correct format (IV:authTag:encrypted)", () => {
      const plaintext = "test";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const parts = encrypted!.split(":");
      expect(parts.length).toBe(3);
      // IV in hex
      expect(parts[0].length).toBe(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      // Auth tag in hex (16 bytes = 32 hex chars)
      expect(parts[1].length).toBe(32);
      // Encrypted data
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

    it("should cache the encryption key", () => {
      const plaintext = "test";
      EncryptionHelper.encrypt(plaintext);
      const firstKeyCache = (EncryptionHelper as any).keyCache;
      EncryptionHelper.encrypt(plaintext);
      const secondKeyCache = (EncryptionHelper as any).keyCache;
      expect(firstKeyCache).toBe(secondKeyCache);
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

    it("should return original if decryption fails (malformed data)", () => {
      // Create invalid encrypted data
      const invalidEncrypted = "invalid:auth:tag";
      const result = EncryptionHelper.decrypt(invalidEncrypted);
      // Should return original value on decryption failure
      expect(result).toBe(invalidEncrypted);
    });

    it("should return plaintext when 3-part value has wrong IV length (e.g. time strings)", () => {
      // A time string like "12:30:45" has exactly 3 colon-separated parts,
      // but the first part "12" decodes to only 1 byte, not the required IV_LENGTH bytes.
      // Without the IV length check this would reach createDecipheriv and throw
      // "Invalid initialization vector".
      const timeString = "12:30:45";
      const result = EncryptionHelper.decrypt(timeString);
      expect(result).toBe(timeString);
    });

    it("should return plaintext when 3-part value has correct IV length but is not encrypted data", () => {
      // Construct a value where the first part is the right hex length but random data
      const fakeIvHex = "a".repeat(ENCRYPTION_CONSTANTS.IV_LENGTH * 2);
      const fakeValue = `${fakeIvHex}:fakeauth:fakedata`;
      const result = EncryptionHelper.decrypt(fakeValue);
      // Should return original value when GCM auth tag verification fails
      expect(result).toBe(fakeValue);
    });

    it("should handle decrypting text encrypted with different IV", () => {
      const plaintext = "test message";
      const encrypted1 = EncryptionHelper.encrypt(plaintext);
      const encrypted2 = EncryptionHelper.encrypt(plaintext);
      // Both should decrypt to same plaintext
      expect(EncryptionHelper.decrypt(encrypted1!)).toBe(plaintext);
      expect(EncryptionHelper.decrypt(encrypted2!)).toBe(plaintext);
    });
  });

  describe("hashEmail", () => {
    it("should hash an email address", () => {
      const email = "test@example.com";
      const hash = EncryptionHelper.hashEmail(email);
      expect(hash).toBeTruthy();
      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(typeof hash).toBe("string");
    });

    it("should return empty string for empty input", () => {
      const result = EncryptionHelper.hashEmail("");
      expect(result).toBe("");
    });

    it("should return empty string for null/undefined", () => {
      expect(EncryptionHelper.hashEmail(null as any)).toBe("");
      expect(EncryptionHelper.hashEmail(undefined as any)).toBe("");
    });

    it("should normalize email to lowercase", () => {
      const email1 = "Test@Example.com";
      const email2 = "test@example.com";
      const hash1 = EncryptionHelper.hashEmail(email1);
      const hash2 = EncryptionHelper.hashEmail(email2);
      expect(hash1).toBe(hash2);
    });

    it("should trim email before hashing", () => {
      const email1 = "test@example.com";
      const email2 = "  test@example.com  ";
      const hash1 = EncryptionHelper.hashEmail(email1);
      const hash2 = EncryptionHelper.hashEmail(email2);
      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hashes for same email", () => {
      const email = "test@example.com";
      const hash1 = EncryptionHelper.hashEmail(email);
      const hash2 = EncryptionHelper.hashEmail(email);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different emails", () => {
      const email1 = "test1@example.com";
      const email2 = "test2@example.com";
      const hash1 = EncryptionHelper.hashEmail(email1);
      const hash2 = EncryptionHelper.hashEmail(email2);
      expect(hash1).not.toBe(hash2);
    });

    it("should handle emails with special characters", () => {
      const email = "test+tag@example.com";
      const hash = EncryptionHelper.hashEmail(email);
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
      // Create invalid JSON by encrypting non-JSON string
      const plaintext = "not json";
      const encrypted = EncryptionHelper.encrypt(plaintext);
      const result = encryptedJsonTransformer.from(encrypted!);
      // Should return null when JSON parse fails
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
});
