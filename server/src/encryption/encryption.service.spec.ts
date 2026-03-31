import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { EncryptionService } from "./encryption.service";

describe("EncryptionService", () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "ENCRYPTION_KEY") {
                return "test-encryption-key-32-chars!!";
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe("constructor", () => {
    it("should throw FATAL error when ENCRYPTION_KEY is not set", async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => undefined),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow("FATAL: ENCRYPTION_KEY is not configured.");
    });

    it("should throw FATAL error when ENCRYPTION_KEY is empty string", async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => ""),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow("FATAL: ENCRYPTION_KEY is not configured.");
    });
  });

  describe("encrypt", () => {
    it("should encrypt a string value", () => {
      const plaintext = "Hello, World!";
      const encrypted = service.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      // Format: IV:authTag:encrypted
      expect(encrypted).toContain(":");
    });

    it("should return empty string for empty input", () => {
      const result = service.encrypt("");
      expect(result).toBe("");
    });

    it("should produce different encrypted values for same input (due to random IV)", () => {
      const plaintext = "Hello, World!";
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should encrypt special characters correctly", () => {
      const plaintext = "Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?";
      const encrypted = service.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt unicode characters correctly", () => {
      const plaintext = "Hello 世界 🌍";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt long strings", () => {
      const plaintext = "A".repeat(10000);
      const encrypted = service.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt email addresses", () => {
      const email = "test@example.com";
      const encrypted = service.encrypt(email);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(email);
    });

    it("should produce encrypted output in correct format (IV:authTag:encrypted)", () => {
      const plaintext = "test";
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(":");
      expect(parts.length).toBe(3);
      // IV in hex (16 bytes = 32 hex chars)
      expect(parts[0].length).toBe(32);
      // Auth tag in hex (16 bytes = 32 hex chars)
      expect(parts[1].length).toBe(32);
      // Encrypted data
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted string back to original", () => {
      const plaintext = "Hello, World!";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should return empty string for empty input", () => {
      const result = service.decrypt("");
      expect(result).toBe("");
    });

    it("should return plaintext for already decrypted text (backwards compatibility)", () => {
      const plaintext = "Already decrypted text";
      const result = service.decrypt(plaintext);
      expect(result).toBe(plaintext);
    });

    it("should return plaintext for text without colons (backwards compatibility)", () => {
      const plaintext = "Plain text without colons";
      const result = service.decrypt(plaintext);
      expect(result).toBe(plaintext);
    });

    it("should return plaintext for invalid format (not 3 parts)", () => {
      // Only 2 parts, need 3
      const invalidFormat = "part1:part2";
      const result = service.decrypt(invalidFormat);
      expect(result).toBe(invalidFormat);
    });

    it("should handle decryption of different encrypted versions of same text", () => {
      const plaintext = "Same text, different IVs";
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      const decrypted1 = service.decrypt(encrypted1);
      const decrypted2 = service.decrypt(encrypted2);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it("should throw when decryption fails (malformed data)", () => {
      const invalidEncrypted = "invalid:format:data";
      expect(() => service.decrypt(invalidEncrypted)).toThrow();
    });

    it("should decrypt special characters correctly", () => {
      const plaintext = "Special: !@#$%";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("hashEmail", () => {
    it("should hash an email address", () => {
      const email = "test@example.com";
      const hash = service.hashEmail(email);
      expect(hash).toBeTruthy();
      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
    });

    it("should return empty string for empty email", () => {
      const result = service.hashEmail("");
      expect(result).toBe("");
    });

    it("should return empty string for null/undefined email", () => {
      expect(service.hashEmail(null)).toBe("");
      expect(service.hashEmail(undefined)).toBe("");
    });

    it("should normalize email to lowercase before hashing", () => {
      const email1 = "Test@Example.com";
      const email2 = "test@example.com";
      const hash1 = service.hashEmail(email1);
      const hash2 = service.hashEmail(email2);
      expect(hash1).toBe(hash2);
    });

    it("should trim whitespace before hashing", () => {
      const email1 = "test@example.com";
      const email2 = "  test@example.com  ";
      const hash1 = service.hashEmail(email1);
      const hash2 = service.hashEmail(email2);
      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hashes for same email", () => {
      const email = "test@example.com";
      const hash1 = service.hashEmail(email);
      const hash2 = service.hashEmail(email);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different emails", () => {
      const hash1 = service.hashEmail("test1@example.com");
      const hash2 = service.hashEmail("test2@example.com");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle emails with special characters", () => {
      const email = "test+tag@example.com";
      const hash = service.hashEmail(email);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });
  });

  describe("createTransformer", () => {
    it("should create a transformer with to and from methods", () => {
      const transformer = service.createTransformer();
      expect(transformer).toHaveProperty("to");
      expect(transformer).toHaveProperty("from");
      expect(typeof transformer.to).toBe("function");
      expect(typeof transformer.from).toBe("function");
    });

    it("should encrypt value in to method", () => {
      const transformer = service.createTransformer();
      const plaintext = "test value";
      const encrypted = transformer.to(plaintext);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":");
    });

    it("should decrypt value in from method", () => {
      const transformer = service.createTransformer();
      const plaintext = "test value";
      const encrypted = transformer.to(plaintext);
      const decrypted = transformer.from(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should return null for null value in to method", () => {
      const transformer = service.createTransformer();
      const result = transformer.to(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined value in to method", () => {
      const transformer = service.createTransformer();
      const result = transformer.to(undefined);
      expect(result).toBeNull();
    });

    it("should return null for null value in from method", () => {
      const transformer = service.createTransformer();
      const result = transformer.from(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined value in from method", () => {
      const transformer = service.createTransformer();
      const result = transformer.from(undefined);
      expect(result).toBeNull();
    });

    it("should handle round-trip transformation", () => {
      const transformer = service.createTransformer();
      const plaintext = "Original value";
      const encrypted = transformer.to(plaintext);
      const decrypted = transformer.from(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("Integration Tests", () => {
    it("should encrypt and decrypt email addresses correctly", () => {
      const emails = [
        "user@example.com",
        "test.user+tag@subdomain.example.com",
        "user@example.co.uk",
      ];
      emails.forEach((email) => {
        const encrypted = service.encrypt(email);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(email);
      });
    });

    it("should handle encrypt/decrypt for various data types as strings", () => {
      const testCases = [
        "123",
        "true",
        "false",
        "null",
        '{"json": "data"}',
        "Multi\nline\nstring",
        'String with "quotes"',
      ];
      testCases.forEach((testCase) => {
        const encrypted = service.encrypt(testCase);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      });
    });
  });
});
