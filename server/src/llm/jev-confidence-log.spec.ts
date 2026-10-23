import {
  formatJevConfidenceRecord,
  JEV_OUTCOMES,
  runnerUpMargin,
} from "./jev-confidence-log";

describe("formatJevConfidenceRecord", () => {
  it("keeps a fixed key order so Logs Insights parse patterns stay stable", () => {
    expect(
      formatJevConfidenceRecord({
        decision: "categorise_summary",
        outcome: JEV_OUTCOMES.BELOW_THRESHOLD,
        confidence: 0.834,
        threshold: 0.9,
        optionCount: 13,
        choseNoneOption: false,
        runnerUpMargin: 0.12,
      }),
    ).toBe(
      "[JEV-CONFIDENCE] decision=categorise_summary outcome=below_threshold confidence=0.83 threshold=0.90 options=13 chose_none=false margin=0.12",
    );
  });

  it("writes none when the decision relied on no answers", () => {
    expect(
      formatJevConfidenceRecord({
        decision: "merge-duplicate-categories",
        outcome: JEV_OUTCOMES.ACCEPTED,
        confidence: null,
        threshold: 0.8,
      }),
    ).toBe(
      "[JEV-CONFIDENCE] decision=merge-duplicate-categories outcome=accepted confidence=none threshold=0.80",
    );
  });
});

describe("runnerUpMargin", () => {
  it("is the gap between the two most probable options", () => {
    expect(runnerUpMargin({ "0": 0.05, "1": 0.55, "2": 0.4 })).toBeCloseTo(
      0.15,
      6,
    );
  });

  it("is the top probability when only one option is listed", () => {
    expect(runnerUpMargin({ "1": 0.7 })).toBeCloseTo(0.7, 6);
  });

  it("is 0 when there are no probabilities", () => {
    expect(runnerUpMargin({})).toBe(0);
  });
});
