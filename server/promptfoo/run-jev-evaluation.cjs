const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("./providers/jev-categorisation.cjs"); // Register the TypeScript loader.
const { EVALUATION_SUITES } = require("./providers/jev-decision-plan.cjs");
const server = path.resolve(__dirname, "..");
const mode = process.env.JEV_EVAL_MODE || "jev";
const reportDir =
  process.env.JEV_EVAL_REPORT_DIR ||
  path.join(os.tmpdir(), `bearlymail-${mode}-decisions`);
const envFile = process.argv[2];
if (!envFile)
  throw new Error(
    "Usage: [JEV_EVAL_MODE=jev|gemini] node promptfoo/run-jev-evaluation.cjs /path/to/server/.env [suite...]",
  );
const suites = process.argv.slice(3);
const requested = suites.length ? suites : EVALUATION_SUITES;
for (const suite of requested)
  if (!EVALUATION_SUITES.includes(suite))
    throw new Error(`Unknown suite: ${suite}`);
fs.mkdirSync(reportDir, { recursive: true });
let failed = false;
for (const suite of requested) {
  const report = path.join(reportDir, `${suite}.json`);
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "jev-eval-config-"));
  const log = fs.openSync(path.join(reportDir, `${suite}.log`), "w");
  try {
    if (fs.existsSync(report)) fs.unlinkSync(report);
    const run = spawnSync(
      process.execPath,
      [
        path.join(server, "node_modules/promptfoo/dist/src/entrypoint.js"),
        "eval",
        "-c",
        "promptfoo/jev-decisions.cjs",
        "--env-file",
        path.resolve(envFile),
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
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: "1",
        },
        stdio: ["ignore", log, log],
      },
    );
    if (run.error || !fs.existsSync(report))
      throw new Error(`Evaluation did not produce a report: ${suite}`);
    const rows = JSON.parse(fs.readFileSync(report, "utf8")).results.results;
    const passed = rows.filter((row) => row.success).length;
    const errors = rows.filter((row) => row.response?.error).length;
    failed ||= passed !== rows.length || !rows.length || run.status !== 0;
    process.stdout.write(
      `${suite}: ${passed}/${rows.length} pass, ${errors} errors\n`,
    );
  } finally {
    fs.closeSync(log);
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}
process.exitCode = failed ? 1 : 0;
