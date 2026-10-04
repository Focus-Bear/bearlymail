const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const definitions = require("./jev-evaluation-questions.json");
const synthetic = require("./jev-synthetic-fixtures.cjs");
const LOCAL_ASSERTIONS = new Set(["javascript", "is-json"]);
const suite = process.env.JEV_EVAL_SUITE || "check-phishing-only";
if (!Object.hasOwn(definitions, suite))
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
  description: `Experimental Jev decisions: ${suite}; production routing unchanged`,
  tests: localTests.map((test) => ({
    ...test,
    options: { ...test.options, disableVarExpansion: true },
  })),
  defaultTest: {
    ...baseline.defaultTest,
    options: { disableVarExpansion: true },
  },
  providers: [
    {
      id: path.join(__dirname, "providers/jev-decisions.cjs"),
      label: "jev-raw",
      config: { suite, mode: "raw" },
    },
  ],
};
