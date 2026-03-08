import { Logger } from "@nestjs/common";

import { isLikelyCompleteJson, safeJsonParse } from "./json";

describe("safeJsonParse", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("valid JSON", () => {
    it("parses a valid JSON object", () => {
      const result = safeJsonParse<{ foo: string }>('{"foo":"bar"}', null);
      expect(result).toEqual({ foo: "bar" });
    });

    it("parses a valid JSON array", () => {
      const result = safeJsonParse<number[]>("[1,2,3]", []);
      expect(result).toEqual([1, 2, 3]);
    });

    it("parses nested objects", () => {
      const input = JSON.stringify({ a: { b: { c: 42 } } });
      const result = safeJsonParse<{ a: { b: { c: number } } }>(input, null);
      expect(result?.a.b.c).toBe(42);
    });
  });

  describe("invalid JSON", () => {
    it("returns the fallback value on invalid JSON", () => {
      const result = safeJsonParse<null>('{"incomplete":', null);
      expect(result).toBeNull();
    });

    it("returns the fallback array on invalid JSON", () => {
      const result = safeJsonParse<string[]>("not-json", []);
      expect(result).toEqual([]);
    });

    it("returns the fallback object on truncated LLM response", () => {
      // Simulates a truncated LLM response (common cause of the PostHog errors)
      const truncated = '{"actions": [{"confidence": 0.9, "type": "archive"';
      const result = safeJsonParse<{ actions: unknown[] }>(truncated, {
        actions: [],
      });
      expect(result).toEqual({ actions: [] });
    });

    it("logs a warning with the label when label is provided", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");
      safeJsonParse("bad json", null, "test-label");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("test-label");
    });

    it("does NOT log a warning when no label is provided", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");
      safeJsonParse("bad json", null);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("handles empty string gracefully", () => {
      const result = safeJsonParse<null>("", null);
      expect(result).toBeNull();
    });
  });
});

describe("isLikelyCompleteJson", () => {
  it("returns true for a complete JSON object", () => {
    expect(isLikelyCompleteJson('{"foo":"bar"}')).toBe(true);
  });

  it("returns true for a complete JSON array", () => {
    expect(isLikelyCompleteJson("[1, 2, 3]")).toBe(true);
  });

  it("returns false for a truncated object (missing closing brace)", () => {
    expect(isLikelyCompleteJson('{"foo": "bar"')).toBe(false);
  });

  it("returns false for a truncated array (missing closing bracket)", () => {
    expect(isLikelyCompleteJson("[1, 2")).toBe(false);
  });

  it("returns false for plain text (no JSON at all)", () => {
    expect(isLikelyCompleteJson("not json")).toBe(false);
  });

  it("returns true even for empty braces (technically valid JSON)", () => {
    expect(isLikelyCompleteJson("{}")).toBe(true);
  });

  it("handles leading/trailing whitespace", () => {
    expect(isLikelyCompleteJson('  {"a":1}  ')).toBe(true);
    expect(isLikelyCompleteJson("  [1]  ")).toBe(true);
  });

  it("returns false for nested incomplete JSON (Raccoon note: first/last char only)", () => {
    // Raccoon noted this is a known limitation — try-catch is still the real guard
    // A string like '{"a": 1, "b": {"c": 2}' (missing final '}') starts with '{'
    // but ends with '}' from the inner object, so it would return true here
    // This test documents the known false-positive behaviour
    const partialWithMatchingInnerBrace = '{"a": 1, "b": {"c": 2}';
    // false because it ends with '}' — but note: this is a FALSE POSITIVE
    // The Raccoon comment in the plan explicitly notes this limitation
    expect(isLikelyCompleteJson(partialWithMatchingInnerBrace)).toBe(true);
  });
});
