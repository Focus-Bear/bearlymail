const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
require("./providers/jev-categorisation.cjs"); // Register the TypeScript loader.
const { EVALUATION_SUITES } = require("./providers/jev-decision-plan.cjs");
const synthetic = require("./jev-synthetic-fixtures.cjs");
const { CASE_INDEX_KEY } = require("./providers/jev-decision-log.cjs");
const LOCAL_ASSERTIONS = new Set(["javascript", "is-json"]);
const suite = process.env.JEV_EVAL_SUITE || "check-phishing-only";
const mode = process.env.JEV_EVAL_MODE || "jev";
// Same model and temperature as the production-baseline promptfoo suites.
const GEMINI_BASELINE = {
  id: "google:gemini-3.1-flash-lite",
  label: "gemini-baseline",
  config: { temperature: 0 },
};
const JEV_RAW = {
  id: path.join(__dirname, "providers/jev-decisions.cjs"),
  label: "jev-raw",
  config: { suite, mode: "raw" },
};
const PROVIDERS = { jev: JEV_RAW, gemini: GEMINI_BASELINE };
if (!Object.hasOwn(PROVIDERS, mode))
  throw new Error(`Unsupported Jev evaluation mode: ${mode}`);
if (!EVALUATION_SUITES.includes(suite))
  throw new Error(`Unsupported Jev evaluation suite: ${suite}`);
const baseline =
  synthetic[suite] ||
  YAML.parse(fs.readFileSync(path.join(__dirname, `${suite}.yaml`), "utf8"));
const localTests = baseline.tests.filter((test) =>
  (test.assert || []).every((assertion) =>
    LOCAL_ASSERTIONS.has(assertion.type),
  ),
);
if (localTests.length !== baseline.tests.length)
  process.stderr.write(
    `${suite}: excluded ${baseline.tests.length - localTests.length} cases with external model graders (not authorised).\n`,
  );
module.exports = {
  ...baseline,
  description: `Experimental ${mode} decisions: ${suite}; production routing unchanged`,
  tests: localTests.map((test, caseIndex) => ({
    ...test,
    options: { ...test.options, disableVarExpansion: true },
    metadata: { ...test.metadata, [CASE_INDEX_KEY]: caseIndex },
  })),
  defaultTest: {
    ...baseline.defaultTest,
    options: { disableVarExpansion: true },
  },
  providers: [PROVIDERS[mode]],
};
