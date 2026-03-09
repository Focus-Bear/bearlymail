import {
  matchAny,
  matchPattern,
  validatePattern,
  validatePatterns,
} from "./pattern-matcher";

describe("matchPattern", () => {
  describe("regex patterns", () => {
    it("matches a basic regex pattern", () => {
      expect(matchPattern("noreply@github.com", "/github/")).toBe(true);
    });

    it("supports regex flags (case-insensitive)", () => {
      expect(matchPattern("[URGENT] action required", "/urgent/i")).toBe(true);
    });

    it("does not match when regex does not match", () => {
      expect(matchPattern("hello@linear.app", "/github/")).toBe(false);
    });

    it("falls back to substring match when regex is invalid", () => {
      // Invalid regex — treated as plain string
      expect(matchPattern("/regex/invalid-flags", "/regex/invalid-flags")).toBe(
        true,
      );
    });

    it("matches a Pull Request subject pattern", () => {
      expect(
        matchPattern("[Pull Request] Fix login bug", "/\\[Pull Request\\]/i"),
      ).toBe(true);
    });
  });

  describe("glob patterns", () => {
    it("matches a wildcard sender domain", () => {
      expect(matchPattern("user@github.com", "*@github.com")).toBe(true);
    });

    it("does not match a different domain", () => {
      expect(matchPattern("user@gitlab.com", "*@github.com")).toBe(false);
    });

    it("matches prefix wildcard", () => {
      expect(matchPattern("noreply@linear.app", "*@linear.app")).toBe(true);
    });

    it("matches multi-segment glob pattern", () => {
      expect(matchPattern("user@team.atlassian.net", "*@*.atlassian.net")).toBe(
        true,
      );
    });

    it("does not match when subdomain is missing", () => {
      expect(matchPattern("user@atlassian.net", "*@*.atlassian.net")).toBe(
        false,
      );
    });

    it("is case-insensitive for globs", () => {
      expect(matchPattern("User@GITHUB.COM", "*@github.com")).toBe(true);
    });
  });

  describe("plain substring patterns", () => {
    it("matches a case-insensitive substring in email address", () => {
      expect(matchPattern("alerts@github.com", "github")).toBe(true);
    });

    it("matches a case-insensitive substring in subject", () => {
      expect(matchPattern("Your invoice is ready", "invoice")).toBe(true);
    });

    it("does not match when substring is absent", () => {
      expect(matchPattern("hello@example.com", "github")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(matchPattern("INVOICE ATTACHED", "invoice")).toBe(true);
    });
  });
});

describe("matchAny", () => {
  it("returns true when the array is empty (no constraint)", () => {
    expect(matchAny("anything@example.com", [])).toBe(true);
  });

  it("returns true when at least one pattern matches", () => {
    expect(matchAny("user@github.com", ["*@gitlab.com", "*@github.com"])).toBe(
      true,
    );
  });

  it("returns false when no pattern matches", () => {
    expect(matchAny("user@example.com", ["*@gitlab.com", "*@github.com"])).toBe(
      false,
    );
  });
});

describe("validatePattern", () => {
  it("returns null for a valid regex", () => {
    expect(validatePattern("/\\[PR\\]/i")).toBeNull();
  });

  it("returns an error string for an invalid regex", () => {
    expect(validatePattern("/[invalid/")).not.toBeNull();
  });

  it("returns null for a glob pattern", () => {
    expect(validatePattern("*@github.com")).toBeNull();
  });

  it("returns null for a plain string", () => {
    expect(validatePattern("invoice")).toBeNull();
  });
});

describe("validatePatterns", () => {
  it("returns empty array for all valid patterns", () => {
    expect(validatePatterns(["*@github.com", "/invoice/i", "linear"])).toEqual(
      [],
    );
  });

  it("returns error messages for invalid patterns", () => {
    const errors = validatePatterns([
      "/valid/i",
      "/[invalid/",
      "/another[bad/",
    ]);
    expect(errors).toHaveLength(2);
  });
});
