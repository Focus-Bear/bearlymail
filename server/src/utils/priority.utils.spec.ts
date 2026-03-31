import { calculateScoreFromBreakdown } from "./priority.utils";

describe("priority.utils", () => {
  describe("calculateScoreFromBreakdown", () => {
    it("should return 0 for null input", () => {
      const result = calculateScoreFromBreakdown(null);
      expect(result).toBe(0);
    });

    it("should return 0 for undefined input", () => {
      const result = calculateScoreFromBreakdown(undefined);
      expect(result).toBe(0);
    });

    it("should return 0 when breakdown is missing", () => {
      const input = { score: 50 };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(0);
    });

    it("should return 0 when breakdown is empty array", () => {
      const input = { breakdown: [] };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(0);
    });

    it("should calculate score from breakdown values", () => {
      const input = {
        breakdown: [{ value: 10 }, { value: 20 }, { value: 30 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(60);
    });

    it("should handle negative values in breakdown", () => {
      const input = {
        breakdown: [{ value: 50 }, { value: -10 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(40);
    });

    it("should clamp score to minimum of 0", () => {
      const input = {
        breakdown: [{ value: -100 }, { value: -50 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(0);
    });

    it("should clamp score to maximum of 100", () => {
      const input = {
        breakdown: [{ value: 60 }, { value: 50 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(100);
    });

    it("should handle breakdown items with undefined values", () => {
      const input = {
        breakdown: [{ value: 10 }, { value: undefined }, { value: 20 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(30);
    });

    it("should handle breakdown items with null values", () => {
      const input = {
        breakdown: [{ value: 10 }, { value: null }, { value: 20 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(30);
    });

    it("should handle single breakdown item", () => {
      const input = {
        breakdown: [{ value: 75 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(75);
    });

    it("should handle large breakdown arrays", () => {
      const input = {
        breakdown: Array.from({ length: 10 }, (_, i) => ({ value: i + 1 })),
      };
      const result = calculateScoreFromBreakdown(input);
      // Sum of 1+2+...+10 = 55
      expect(result).toBe(55);
    });

    it("should ignore score property when breakdown exists", () => {
      const input = {
        breakdown: [{ value: 30 }],
        // Should be ignored
        score: 50,
      };
      const result = calculateScoreFromBreakdown(input);
      // Uses breakdown, not score
      expect(result).toBe(30);
    });

    it("should handle decimal values", () => {
      const input = {
        breakdown: [{ value: 10.5 }, { value: 20.3 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(30.8);
    });

    it("should handle very small values", () => {
      const input = {
        breakdown: [{ value: 0.1 }, { value: 0.2 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBeCloseTo(0.3);
    });

    it("should handle values that sum to exactly 100", () => {
      const input = {
        breakdown: [{ value: 50 }, { value: 50 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(100);
    });

    it("should handle values that sum to exactly 0", () => {
      const input = {
        breakdown: [{ value: 0 }, { value: 0 }],
      };
      const result = calculateScoreFromBreakdown(input);
      expect(result).toBe(0);
    });
  });
});
