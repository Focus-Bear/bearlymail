// Replays saved raw-Jev and Gemini reports (both temperature 0) to estimate a
// Jev-first/Gemini-fallback cascade at several acceptance thresholds without
// re-calling either provider. Usage:
//   node promptfoo/analyse-jev-cascade.cjs <jev-report-dir> <gemini-report-dir>
require("./providers/jev-categorisation.cjs"); // Register the TypeScript loader.
const fs = require("node:fs");
const path = require("node:path");
const { createPlan } = require("./providers/jev-decision-plan.cjs");
const { compose, confidence } = require("./providers/jev-decision-output.cjs");
const THRESHOLDS = [0, 0.5, 0.6, 0.7, 0.8, 0.9];
// Scores feed numeric outputs through their expected value, so their gate is
// the expected distance from that value in levels (0.5 level = 12.5/100).
const MAX_SCORE_SPREAD_LEVELS = 0.5;
const PERCENTILE = { MEDIAN: 0.5, P95: 0.95 };
const [jevDir, geminiDir] = process.argv.slice(2);
if (!jevDir || !geminiDir)
  throw new Error(
    "Usage: node promptfoo/analyse-jev-cascade.cjs <jev-dir> <gemini-dir>",
  );

const readRows = (dir, suite) =>
  JSON.parse(fs.readFileSync(path.join(dir, `${suite}.json`), "utf8")).results
    .results;

function scoreSpread(answer) {
  const levels = Object.entries(answer.probabilities).map(([level, p]) => [
    Number(level),
    p,
  ]);
  const expected = levels.reduce((sum, [level, p]) => sum + level * p, 0);
  return levels.reduce(
    (sum, [level, p]) => sum + p * Math.abs(level - expected),
    0,
  );
}

function isAccepted(answer, threshold, scoreGate) {
  if (answer.type === "score" && scoreGate === "spread")
    return scoreSpread(answer) <= MAX_SCORE_SPREAD_LEVELS;
  return confidence(answer) >= threshold;
}

function replayCase(suite, jevRow) {
  const answers = jevRow.response?.metadata?.answers;
  if (jevRow.response?.error || !answers) return null;
  const plan = createPlan(suite, jevRow.vars, jevRow.prompt.raw);
  const { generationRequired, usedKeys } = compose(plan, answers);
  return { generationRequired, used: usedKeys.map((key) => answers[key]) };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ];
}

function loadCases() {
  const suites = fs
    .readdirSync(jevDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((suite) => fs.existsSync(path.join(geminiDir, `${suite}.json`)));
  return suites.flatMap((suite) => {
    const gemini = new Map(
      readRows(geminiDir, suite).map((row) => [row.testIdx, row]),
    );
    return readRows(jevDir, suite).map((jev) => ({
      suite,
      jev,
      gemini: gemini.get(jev.testIdx),
      replay: replayCase(suite, jev),
    }));
  });
}

function simulate(cases, threshold, scoreGate) {
  const routed = cases.map(({ jev, gemini, replay }) => {
    const useJev =
      replay &&
      !replay.generationRequired &&
      replay.used.every((answer) => isAccepted(answer, threshold, scoreGate));
    if (useJev)
      return {
        pass: jev.success,
        ms: jev.latencyMs,
        tokens: jev.response.tokenUsage.total,
        jev: true,
      };
    return {
      pass: gemini.success,
      ms: jev.latencyMs + gemini.latencyMs,
      tokens:
        (jev.response.tokenUsage?.total || 0) +
        (gemini.response.tokenUsage?.total || 0),
      jev: false,
    };
  });
  return summarise(routed);
}

function summarise(routed) {
  return {
    pass: routed.filter((row) => row.pass).length,
    jevOnly: routed.filter((row) => row.jev).length,
    medianMs: percentile(
      routed.map((row) => row.ms),
      PERCENTILE.MEDIAN,
    ),
    p95Ms: percentile(
      routed.map((row) => row.ms),
      PERCENTILE.P95,
    ),
    tokens: routed.reduce((sum, row) => sum + row.tokens, 0),
  };
}

const baseline = (cases, key) =>
  summarise(
    cases.map((row) => ({
      pass: row[key].success,
      ms: row[key].latencyMs,
      tokens: row[key].response.tokenUsage?.total || 0,
      jev: key === "jev",
    })),
  );

const cases = loadCases();
const rows = [
  { route: "Gemini only", ...baseline(cases, "gemini") },
  { route: "Jev only", ...baseline(cases, "jev") },
  ...THRESHOLDS.flatMap((threshold) => [
    {
      route: `Cascade ≥${threshold}`,
      ...simulate(cases, threshold, "confidence"),
    },
    {
      route: `Cascade ≥${threshold}, score spread ≤${MAX_SCORE_SPREAD_LEVELS}`,
      ...simulate(cases, threshold, "spread"),
    },
  ]),
];
process.stdout.write(`${cases.length} cases\n`);
for (const row of rows)
  process.stdout.write(
    `| ${row.route} | ${row.pass}/${cases.length} | ${row.jevOnly} | ${row.medianMs} | ${row.p95Ms} | ${row.tokens} |\n`,
  );
