// Promptfoo drops the response when a file assertion throws, so the provider
// also writes each accept/defer decision here for the runner's acceptance gate.
// Cases are matched by an explicit index: promptfoo trims and re-serialises
// vars in its report, so var values are not a stable key.
const fs = require("node:fs");
const CASE_INDEX_KEY = "jevCaseIndex";

const caseIndexOf = (testCase) => testCase?.metadata?.[CASE_INDEX_KEY];

function recordDecision(testCase, accepted) {
  const log = process.env.JEV_EVAL_DECISION_LOG;
  if (log)
    fs.appendFileSync(
      log,
      `${JSON.stringify({ caseIndex: caseIndexOf(testCase), accepted })}\n`,
    );
}

function readAcceptedCases(log) {
  if (!fs.existsSync(log)) return new Set();
  return new Set(
    fs
      .readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((decision) => decision.accepted)
      .map((decision) => decision.caseIndex),
  );
}

module.exports = {
  CASE_INDEX_KEY,
  caseIndexOf,
  recordDecision,
  readAcceptedCases,
};
