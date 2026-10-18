// High-priority detection on the labelled prioritise-email fixtures: how often
// an email that must be high urgency is scored high (recall), and how often a
// high score is deserved (precision). The 90% bar for trusting a priority
// model is about this decision, not the exact score.
const PRIORITY_SUITE = "prioritise-email-prompts";
// The prompt's "high" urgency band starts at 61 (61–89 high, 90–100 critical).
const HIGH_URGENCY_MIN = 61;
const PERCENT = 100;

/** "high" / "not-high" from a case's score bounds, or null when it has none. */
function expectedLabel(testCase) {
  const config = (testCase?.assert || []).find(
    (assertion) => assertion.config,
  )?.config;
  if (config?.minScore >= HIGH_URGENCY_MIN) return "high";
  if (config?.maxScore !== undefined && config.maxScore < HIGH_URGENCY_MIN)
    return "not-high";
  return null;
}

function predictedUrgency(row) {
  const text = row.response?.output;
  if (typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
    const score = (parsed.result || parsed).urgencyScore;
    return typeof score === "number" ? score : null;
  } catch {
    return null;
  }
}

const ratio = (part, whole) => (whole ? part / whole : null);

/** Precision/recall of "urgencyScore >= 61" against the labelled cases. */
function highPriorityDetection(rows) {
  const counts = { truePositive: 0, falsePositive: 0, falseNegative: 0 };
  let labelled = 0;
  let unscored = 0;
  for (const row of rows) {
    const label = expectedLabel(row.testCase);
    if (!label) continue;
    labelled++;
    const urgency = predictedUrgency(row);
    if (urgency === null) {
      unscored++;
      continue;
    }
    const predictedHigh = urgency >= HIGH_URGENCY_MIN;
    if (predictedHigh && label === "high") counts.truePositive++;
    if (predictedHigh && label === "not-high") counts.falsePositive++;
    if (!predictedHigh && label === "high") counts.falseNegative++;
  }
  const { truePositive, falsePositive, falseNegative } = counts;
  return {
    labelled,
    unscored,
    ...counts,
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
  };
}

const percent = (value) =>
  value === null ? "n/a" : `${Math.round(value * PERCENT)}%`;

function formatDetection(name, metrics) {
  return `${name}: high-priority precision ${percent(metrics.precision)}, recall ${percent(metrics.recall)} (${metrics.labelled} labelled cases; TP ${metrics.truePositive}, FP ${metrics.falsePositive}, FN ${metrics.falseNegative}, unscored ${metrics.unscored})\n`;
}

module.exports = {
  PRIORITY_SUITE,
  HIGH_URGENCY_MIN,
  expectedLabel,
  formatDetection,
  highPriorityDetection,
};
