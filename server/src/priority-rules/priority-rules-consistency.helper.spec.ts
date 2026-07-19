import {
  computeBandConsistency,
  qualifiesForRule,
  shouldRetireForDrift,
} from "./priority-rules-consistency.helper";

describe("computeBandConsistency", () => {
  it("returns an empty result for no scores", () => {
    expect(computeBandConsistency([])).toEqual({
      sampleCount: 0,
      dominantBand: null,
      dominantShare: 0,
    });
  });

  it("reports a single dominant band when all scores agree", () => {
    // All scores 80 → band "high".
    const scores = Array(10).fill(80);
    expect(computeBandConsistency(scores)).toEqual({
      sampleCount: 10,
      dominantBand: "high",
      dominantShare: 1,
    });
  });

  it("computes the dominant band and its share for a mixed set", () => {
    // 8 high (80), 2 medium (50) → 0.8 share of "high"
    const scores = [...Array(8).fill(80), ...Array(2).fill(50)];
    const result = computeBandConsistency(scores);
    expect(result.dominantBand).toBe("high");
    expect(result.dominantShare).toBeCloseTo(0.8);
    expect(result.sampleCount).toBe(10);
  });

  it("breaks ties toward the higher-urgency band", () => {
    // 5 urgent (95), 5 low (35) — equal counts; urgent must win.
    const scores = [...Array(5).fill(95), ...Array(5).fill(35)];
    const result = computeBandConsistency(scores);
    expect(result.dominantBand).toBe("urgent");
    expect(result.dominantShare).toBeCloseTo(0.5);
  });
});

describe("qualifiesForRule", () => {
  it("rejects when below the sample minimum", () => {
    expect(
      qualifiesForRule({
        sampleCount: 24,
        dominantBand: "high",
        dominantShare: 1,
      }),
    ).toBe(false);
  });

  it("rejects when the dominant band share is below threshold", () => {
    expect(
      qualifiesForRule({
        sampleCount: 50,
        dominantBand: "high",
        dominantShare: 0.89,
      }),
    ).toBe(false);
  });

  it("rejects when there is no dominant band", () => {
    expect(
      qualifiesForRule({
        sampleCount: 50,
        dominantBand: null,
        dominantShare: 0,
      }),
    ).toBe(false);
  });

  it("accepts at exactly the gate boundaries", () => {
    expect(
      qualifiesForRule({
        sampleCount: 25,
        dominantBand: "low",
        dominantShare: 0.9,
      }),
    ).toBe(true);
  });
});

describe("shouldRetireForDrift", () => {
  it("does not retire below the minimum shadow samples", () => {
    // 9 samples, all diverged — still too few to act on.
    expect(shouldRetireForDrift(9, 9)).toBe(false);
  });

  it("retires when divergence exceeds the rate with enough samples", () => {
    // 10 samples, 4 diverged = 0.4 > 0.3.
    expect(shouldRetireForDrift(10, 4)).toBe(true);
  });

  it("keeps a rule whose divergence is within the allowed rate", () => {
    // 20 samples, 5 diverged = 0.25 < 0.3.
    expect(shouldRetireForDrift(20, 5)).toBe(false);
  });
});
