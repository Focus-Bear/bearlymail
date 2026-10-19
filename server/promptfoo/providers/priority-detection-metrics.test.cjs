const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  expectedLabel,
  highPriorityDetection,
} = require("./priority-detection-metrics.cjs");

const fixture = (config, urgencyScore) => ({
  testCase: { assert: [{ type: "javascript", config }] },
  response:
    urgencyScore === undefined
      ? { error: "failed" }
      : { output: JSON.stringify({ result: { urgencyScore } }) },
});

test("labels cases by their score bounds and skips unbounded ones", () => {
  assert.equal(expectedLabel(fixture({ minScore: 75 }).testCase), "high");
  assert.equal(expectedLabel(fixture({ maxScore: 49 }).testCase), "not-high");
  assert.equal(expectedLabel(fixture({ minScore: 55 }).testCase), null);
  assert.equal(expectedLabel(fixture({ maxScore: 75 }).testCase), null);
  assert.equal(expectedLabel({ assert: [{ type: "javascript" }] }), null);
});

test("computes high-priority precision and recall at the high band", () => {
  const metrics = highPriorityDetection([
    fixture({ minScore: 85 }, 90),
    fixture({ minScore: 75 }, 40),
    fixture({ maxScore: 49 }, 70),
    fixture({ maxScore: 40 }, 0),
    fixture({ minScore: 90 }),
    fixture({ minScore: 55 }, 80),
  ]);
  assert.deepEqual(metrics, {
    labelled: 5,
    unscored: 1,
    truePositive: 1,
    falsePositive: 1,
    falseNegative: 1,
    precision: 0.5,
    recall: 0.5,
  });
});
