// Runs Jev decision suites through promptfoo.
//   JEV_EVAL_MODE=jev|gemini   provider to evaluate (default jev)
//   JEV_EVAL_GATE=accepted     CI gate: only cases production would accept
//                              from Jev must pass; deferred cases go to the
//                              LLM, whose own promptfoo suites cover them
//   JEV_EVAL_ENV_FILE=path     optional .env to load (CI uses real env vars)
// Usage: node promptfoo/run-jev-evaluation.cjs [suite...]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("./providers/jev-categorisation.cjs"); // Register the TypeScript loader.
const {
  EVALUATION_SUITES,
  ROUTED_SUITES,
} = require("./providers/jev-decision-plan.cjs");
const { JEV } = require("../src/constants/jev.constants");
const {
  caseIndexOf,
  readAcceptedCases,
} = require("./providers/jev-decision-log.cjs");
const ACCEPTANCE_GATE = "accepted";
const server = path.resolve(__dirname, "..");
const mode = process.env.JEV_EVAL_MODE || "jev";
const isAcceptanceGate = process.env.JEV_EVAL_GATE === ACCEPTANCE_GATE;
if (process.env.JEV_EVAL_ENV_FILE)
  process.loadEnvFile(path.resolve(process.env.JEV_EVAL_ENV_FILE));
const reportDir =
  process.env.JEV_EVAL_REPORT_DIR ||
  path.join(os.tmpdir(), `bearlymail-${mode}-decisions`);

function requestedSuites() {
  const suites = process.argv.slice(2);
  const requested = suites.length
    ? suites
    : isAcceptanceGate
      ? ROUTED_SUITES
      : EVALUATION_SUITES;
  for (const suite of requested)
    if (!EVALUATION_SUITES.includes(suite))
      throw new Error(`Unknown suite: ${suite}`);
  return requested;
}

function runPromptfoo(suite, report, decisionLog) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "jev-eval-config-"));
  const log = fs.openSync(path.join(reportDir, `${suite}.log`), "w");
  try {
    const run = spawnSync(
      process.execPath,
      [
        path.join(server, "node_modules/promptfoo/dist/src/entrypoint.js"),
        "eval",
        "-c",
        "promptfoo/jev-decisions.cjs",
        "--no-cache",
        "--no-share",
        "--no-table",
        "--no-progress-bar",
        "-o",
        report,
      ],
      {
        cwd: server,
        env: {
          ...process.env,
          JEV_EVAL_SUITE: suite,
          JEV_EVAL_MODE: mode,
          JEV_EVAL_DECISION_LOG: decisionLog,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: "1",
        },
        stdio: ["ignore", log, log],
      },
    );
    if (run.error || !fs.existsSync(report))
      throw new Error(`Evaluation did not produce a report: ${suite}`);
    return run.status;
  } finally {
    fs.closeSync(log);
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

/** Returns true when the suite fails its check. */
function evaluateSuite(suite) {
  const report = path.join(reportDir, `${suite}.json`);
  const decisionLog = path.join(reportDir, `${suite}.decisions.jsonl`);
  for (const file of [report, decisionLog])
    if (fs.existsSync(file)) fs.unlinkSync(file);
  const status = runPromptfoo(suite, report, decisionLog);
  const rows = JSON.parse(fs.readFileSync(report, "utf8")).results.results;
  const errors = rows.filter((row) => row.response?.error).length;
  if (!isAcceptanceGate) {
    const passed = rows.filter((row) => row.success).length;
    process.stdout.write(
      `${suite}: ${passed}/${rows.length} pass, ${errors} errors\n`,
    );
    return passed !== rows.length || !rows.length || status !== 0;
  }
  const accepted = readAcceptedCases(decisionLog);
  const acceptedRows = rows.filter((row) =>
    accepted.has(caseIndexOf(row.testCase)),
  );
  const wrong = acceptedRows.filter((row) => !row.success);
  process.stdout.write(
    `${suite}: ${acceptedRows.length - wrong.length}/${acceptedRows.length} Jev-accepted correct, ${rows.length - acceptedRows.length} deferred to the LLM, ${errors} errors\n`,
  );
  for (const row of wrong)
    process.stdout.write(
      `  ✗ accepted but wrong: ${row.testCase?.description || JSON.stringify(row.vars)}\n`,
    );
  return wrong.length > 0 || errors > 0 || !rows.length;
}

if (isAcceptanceGate && !process.env[JEV.API_KEY_ENV]) {
  // Visible in the CI summary so a missing secret is not mistaken for a pass.
  process.stdout.write(
    `::warning::${JEV.API_KEY_ENV} is not set; Jev routed-decision checks were skipped.\n`,
  );
} else {
  fs.mkdirSync(reportDir, { recursive: true });
  let failed = false;
  for (const suite of requestedSuites())
    failed = evaluateSuite(suite) || failed;
  process.exitCode = failed ? 1 : 0;
}
