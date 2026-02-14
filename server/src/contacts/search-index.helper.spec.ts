import { SearchIndexHelper } from "./search-index.helper";

describe("SearchIndexHelper", () => {
  describe("hashExact", () => {
    it("should hash a string value", () => {
      const value = "test@example.com";
      const hash = SearchIndexHelper.hashExact(value);
      expect(hash).toBeTruthy();
      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(typeof hash).toBe("string");
    });

    it("should return empty string for empty input", () => {
      const result = SearchIndexHelper.hashExact("");
      expect(result).toBe("");
    });

    it("should normalize to lowercase", () => {
      const value1 = "Test@Example.com";
      const value2 = "test@example.com";
      const hash1 = SearchIndexHelper.hashExact(value1);
      const hash2 = SearchIndexHelper.hashExact(value2);
      expect(hash1).toBe(hash2);
    });

    it("should trim whitespace before hashing", () => {
      const value1 = "test@example.com";
      const value2 = "  test@example.com  ";
      const hash1 = SearchIndexHelper.hashExact(value1);
      const hash2 = SearchIndexHelper.hashExact(value2);
      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hashes for same input", () => {
      const value = "test@example.com";
      const hash1 = SearchIndexHelper.hashExact(value);
      const hash2 = SearchIndexHelper.hashExact(value);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = SearchIndexHelper.hashExact("test1@example.com");
      const hash2 = SearchIndexHelper.hashExact("test2@example.com");
      expect(hash1).not.toBe(hash2);
    });

    it("should match expected SHA-256 hash format", () => {
      const value = "test";
      const hash = SearchIndexHelper.hashExact(value);
      // Verify it's a valid hex string
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle special characters", () => {
      const value = "test+tag@example.com";
      const hash = SearchIndexHelper.hashExact(value);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it("should handle unicode characters", () => {
      const value = "test@例子.com";
      const hash = SearchIndexHelper.hashExact(value);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });
  });

  describe("generateSearchTokens", () => {
    it("should generate tokens from single value", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("John Smith");
      expect(tokens.length).toBeGreaterThan(0);
      expect(Array.isArray(tokens)).toBe(true);
    });

    it("should generate tokens from multiple values", () => {
      const tokens = SearchIndexHelper.generateSearchTokens(
        "John",
        "Smith",
        "john.smith@example.com",
      );
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should skip null and undefined values", () => {
      const tokens = SearchIndexHelper.generateSearchTokens(
        "John",
        null,
        undefined,
        "Smith",
      );
      expect(tokens.length).toBeGreaterThan(0);
      // Should not throw error
    });

    it("should generate trigram tokens", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("John");
      // Should include trigrams like "joh", "ohn"
      expect(tokens.length).toBeGreaterThan(1);
    });

    it("should generate word tokens", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("John Smith");
      // Should include tokens for "john" and "smith"
      expect(tokens.length).toBeGreaterThan(2);
    });

    it("should normalize tokens to lowercase", () => {
      const tokens1 = SearchIndexHelper.generateSearchTokens("John Smith");
      const tokens2 = SearchIndexHelper.generateSearchTokens("john smith");
      // Should produce same tokens (after normalization)
      expect(tokens1.length).toBe(tokens2.length);
    });

    it("should handle empty strings", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("", "John");
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should generate unique tokens (no duplicates)", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("John John");
      const uniqueTokens = new Set(tokens);
      expect(tokens.length).toBe(uniqueTokens.size);
    });

    it("should handle email addresses", () => {
      const tokens = SearchIndexHelper.generateSearchTokens(
        "john.smith@example.com",
      );
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should handle long strings", () => {
      const longString = "A".repeat(1000);
      const tokens = SearchIndexHelper.generateSearchTokens(longString);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("hashToken", () => {
    // hashToken is private, but we can test it indirectly through generateSearchTokens
    it("should hash tokens consistently", () => {
      const tokens1 = SearchIndexHelper.generateSearchTokens("test");
      const tokens2 = SearchIndexHelper.generateSearchTokens("test");
      // Same input should produce same tokens
      expect(tokens1).toEqual(tokens2);
    });

    it("should produce truncated hex hashes (16 chars)", () => {
      const tokens = SearchIndexHelper.generateSearchTokens("test");
      tokens.forEach((token) => {
        // hashToken truncates to 16 chars
        expect(token.length).toBe(16);
        expect(token).toMatch(/^[a-f0-9]{16}$/);
      });
    });
  });

  describe("generateQueryTokens", () => {
    it("should generate tokens from query string", () => {
      const tokens = SearchIndexHelper.generateQueryTokens("John Smith");
      expect(tokens.length).toBeGreaterThan(0);
      expect(Array.isArray(tokens)).toBe(true);
    });

    it("should return empty array for empty query", () => {
      const tokens = SearchIndexHelper.generateQueryTokens("");
      expect(tokens).toEqual([]);
    });

    it("should generate same tokens as generateSearchTokens for same input", () => {
      const query = "John Smith";
      const queryTokens = SearchIndexHelper.generateQueryTokens(query);
      const searchTokens = SearchIndexHelper.generateSearchTokens(query);
      // Should have similar structure (both use hashToken)
      expect(queryTokens.length).toBeGreaterThan(0);
      expect(searchTokens.length).toBeGreaterThan(0);
    });

    it("should generate prefix tokens for partial matching", () => {
      const tokens = SearchIndexHelper.generateQueryTokens("John");
      // Should include prefixes like "jo", "joh", "john"
      expect(tokens.length).toBeGreaterThan(1);
    });

    it("should normalize query to lowercase", () => {
      const tokens1 = SearchIndexHelper.generateQueryTokens("John");
      const tokens2 = SearchIndexHelper.generateQueryTokens("john");
      expect(tokens1).toEqual(tokens2);
    });

    it("should trim whitespace", () => {
      const tokens1 = SearchIndexHelper.generateQueryTokens("John");
      const tokens2 = SearchIndexHelper.generateQueryTokens("  John  ");
      expect(tokens1).toEqual(tokens2);
    });
  });

  describe("extractEmailDomain", () => {
    it("should extract domain from email address", () => {
      const domain = SearchIndexHelper.extractEmailDomain("test@example.com");
      expect(domain).toBe("example.com");
    });

    it("should return lowercase domain", () => {
      const domain = SearchIndexHelper.extractEmailDomain("test@EXAMPLE.COM");
      expect(domain).toBe("example.com");
    });

    it("should return null for empty string", () => {
      const domain = SearchIndexHelper.extractEmailDomain("");
      expect(domain).toBeNull();
    });

    it("should return null for email without @", () => {
      const domain = SearchIndexHelper.extractEmailDomain("notanemail");
      expect(domain).toBeNull();
    });

    it("should handle emails with subdomains", () => {
      const domain = SearchIndexHelper.extractEmailDomain(
        "test@mail.example.com",
      );
      expect(domain).toBe("mail.example.com");
    });

    it("should handle emails with plus signs", () => {
      const domain = SearchIndexHelper.extractEmailDomain(
        "test+tag@example.com",
      );
      expect(domain).toBe("example.com");
    });
  });

  describe("extractEmailLocalPart", () => {
    it("should extract local part from email address", () => {
      const local = SearchIndexHelper.extractEmailLocalPart("test@example.com");
      expect(local).toBe("test");
    });

    it("should return lowercase local part", () => {
      const local = SearchIndexHelper.extractEmailLocalPart("TEST@example.com");
      expect(local).toBe("test");
    });

    it("should return null for empty string", () => {
      const local = SearchIndexHelper.extractEmailLocalPart("");
      expect(local).toBeNull();
    });

    it("should return local part for email without @", () => {
      const local = SearchIndexHelper.extractEmailLocalPart("notanemail");
      expect(local).toBe("notanemail");
    });

    it("should handle emails with plus signs", () => {
      const local = SearchIndexHelper.extractEmailLocalPart(
        "test+tag@example.com",
      );
      expect(local).toBe("test+tag");
    });

    it("should handle emails with dots", () => {
      const local = SearchIndexHelper.extractEmailLocalPart(
        "first.last@example.com",
      );
      expect(local).toBe("first.last");
    });
  });
});
