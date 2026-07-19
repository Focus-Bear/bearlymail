import { buildGmailUrlIdsToTry, isHexThreadId } from "./gmail-lookup";

describe("isHexThreadId", () => {
  it("accepts a 16-character lowercase hex string", () => {
    expect(isHexThreadId("18aa4e2f9b9f8bab")).toBe(true);
  });

  it("rejects a hex string that is not exactly 16 characters", () => {
    expect(isHexThreadId("18aa4e2f9b9f8b")).toBe(false);
    expect(isHexThreadId("18aa4e2f9b9f8bab00")).toBe(false);
  });

  it("accepts uppercase hex (the regex is case-insensitive)", () => {
    expect(isHexThreadId("18AA4E2F9B9F8BAB")).toBe(true);
  });

  it("rejects a base64url string", () => {
    expect(isHexThreadId("FMfcgzQgLPMRTlJV")).toBe(false);
  });
});

describe("buildGmailUrlIdsToTry", () => {
  it("returns the ID directly when it is already a 16-char hex thread ID", () => {
    const id = "18aa4e2f9b9f8bab";
    expect(buildGmailUrlIdsToTry(id)).toEqual([id]);
  });

  it("includes the original base64url ID as the first candidate", () => {
    const id = "FMfcgzQfBsphbPMH";
    const result = buildGmailUrlIdsToTry(id);
    expect(result[0]).toBe(id);
  });

  it("includes the full hex-decoded string for non-hex base64url IDs", () => {
    // "YWJj" is base64url for "abc" (0x61, 0x62, 0x63) — 4 chars, 3 bytes, 6-char hex
    const id = "YWJj";
    const result = buildGmailUrlIdsToTry(id);
    expect(result).toContain("616263");
  });

  describe("compound 24-byte Gmail search URL IDs", () => {
    // Gmail search/label URLs encode a compound value:
    //   bytes  0-7  → thread ID (16 hex chars)
    //   bytes 8-15  → message ID (16 hex chars)
    //   bytes 16-23 → ignored (additional Gmail metadata)
    //
    // Constructed test vector:
    //   thread  ID bytes (0-7):  0x14c7dc8334202cf3
    //   message ID bytes (8-15): 0x114e52555c5ab0b2
    //   padding bytes (16-23):   0xa81c08f4af6558ed
    //
    // Base64url of the 24 bytes:
    //   Buffer.from("14c7dc8334202cf3114e52555c5ab0b2a81c08f4af6558ed", "hex").toString("base64url")
    //   = "FMfcgzQgLPMRTlJVXFqwsqgcCPSvZVjt"   (matches the real-world ID from issue #2027)
    const compoundId = "FMfcgzQgLPMRTlJVXFqwsqgcCPSvZVjt";
    const expectedThreadId = "14c7dc8334202cf3";
    const expectedMessageId = "114e52555c5ab0b2";

    it("includes the first-8-bytes (thread ID) as a candidate", () => {
      const result = buildGmailUrlIdsToTry(compoundId);
      expect(result).toContain(expectedThreadId);
    });

    it("includes bytes 8-15 (message ID) as a candidate", () => {
      const result = buildGmailUrlIdsToTry(compoundId);
      expect(result).toContain(expectedMessageId);
    });

    it("includes the original base64url ID as the first candidate", () => {
      const result = buildGmailUrlIdsToTry(compoundId);
      expect(result[0]).toBe(compoundId);
    });

    it("does not include duplicate IDs", () => {
      const result = buildGmailUrlIdsToTry(compoundId);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });
  });

  it("handles base64url IDs with - and _ characters", () => {
    // '-' → '+' and '_' → '/' before base64 decoding
    const id = "AB-_ABCD";
    const result = buildGmailUrlIdsToTry(id);
    expect(result[0]).toBe(id);
    expect(result.length).toBeGreaterThan(1);
  });

  it("always puts the original ID first and does not throw", () => {
    const id = "not-valid-base64!!!";
    expect(() => buildGmailUrlIdsToTry(id)).not.toThrow();
    const result = buildGmailUrlIdsToTry(id);
    expect(result[0]).toBe(id);
  });
});
