// Replays categorisations through single-stage and two-stage Jev and compares
// both with a reference label (the category production's LLM chose, or a
// fixture's expected categories). Calls Jev only; no Gemini.
//
//   node promptfoo/replay-jev-two-stage.cjs <cases.jsonl | export.json | --fixtures> [out.json]
//
// Each JSONL line: { subject, senderName?, senderEmail?, summary, githubFacts?,
//   categories: [{ name, description? }], reference: string | string[],
//   provider? } — rows whose `provider` is "jev" were labelled by Jev itself,
// so they are also reported apart from the LLM-labelled rows.
// --fixtures uses the categorise-summary.yaml cases that assert an expected
// category. Needs TYPESAFE_AI_API_KEY (JEV_EVAL_ENV_FILE=path loads a .env).
require("./providers/jev-categorisation.cjs"); // Register the TypeScript loader.
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("js-yaml");
const { JEV, JEV_TWO_STAGE } = require("../src/constants/jev.constants");
const {
  buildJevCategoryRequest,
  requestJevCategory,
} = require("../src/llm/jev-category-request");
const {
  categoriseInTwoStages,
  TWO_STAGE_OUTCOMES,
} = require("../src/llm/jev-two-stage-category");
const {
  buildFamilyOptions,
  isTwoStageWorthwhile,
} = require("../src/llm/jev-category-families");
const { assignFamily } = require("../src/context/category-family.taxonomy");
const {
  JEV_DECISION_PROVIDER,
} = require("../src/constants/ai-decision-provider.constants");

const CONCURRENCY = 4;
const RETRIES = 2;
const STAGE_TWO_THRESHOLDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85];
const FIXTURE_ASSERTION = "validate-category-choice.js";
const FIXTURE_NAME_SEPARATOR = " — ";

if (process.env.JEV_EVAL_ENV_FILE)
  process.loadEnvFile(path.resolve(process.env.JEV_EVAL_ENV_FILE));
const apiKey = process.env[JEV.API_KEY_ENV];
if (!apiKey) throw new Error(`${JEV.API_KEY_ENV} is required`);
const model = process.env[JEV.MODEL_ENV] || JEV.DEFAULT_MODEL;
const [input, outFile] = process.argv.slice(2);
if (!input)
  throw new Error(
    "Usage: replay-jev-two-stage.cjs <cases.jsonl | --fixtures> [out.json]",
  );

function fixtureCases() {
  const suite = YAML.load(
    fs.readFileSync(path.join(__dirname, "categorise-summary.yaml"), "utf8"),
  );
  return suite.tests.flatMap((test) => {
    const assertion = (test.assert || []).find((a) =>
      String(a.value).endsWith(FIXTURE_ASSERTION),
    );
    if (!assertion?.config?.expected) return [];
    const categories = String(test.vars.categories)
      .split("\n")
      .map((line) => line.match(/^\s*\d+\.\s*(.+?)\s*$/)?.[1])
      .filter(Boolean)
      .map((entry) => {
        const [name, ...rest] = entry.split(FIXTURE_NAME_SEPARATOR);
        return {
          name,
          description: rest.join(FIXTURE_NAME_SEPARATOR) || undefined,
        };
      });
    const byName = new Map(categories.map((c) => [norm(c.name), c.name]));
    return [
      {
        ...test.vars,
        categories,
        reference: assertion.config.expected.map(
          (e) => byName.get(norm(e.split(FIXTURE_NAME_SEPARATOR)[0])) ?? e,
        ),
      },
    ];
  });
}

function norm(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function readCases() {
  if (input === "--fixtures") return fixtureCases();
  const text = fs.readFileSync(input, "utf8");
  // One account's export: a shared category list plus its cases.
  if (input.endsWith(".json")) {
    const { categories, cases } = JSON.parse(text);
    return cases.map((testCase) => ({ ...testCase, categories }));
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRIES) throw error;
    }
  }
}

async function askJev(request, questionId, usage) {
  const response = await withRetry(() => requestJevCategory(request, apiKey));
  usage.push(response.usage.input_tokens);
  return response.answers[questionId];
}

async function replayCase(testCase) {
  const params = { ...testCase, categories: testCase.categories };
  const singleUsage = [];
  const single = await askJev(
    buildJevCategoryRequest(params, model),
    JEV.QUESTION_ID,
    singleUsage,
  );
  const singleName =
    single.choice === JEV.OTHER_OPTION
      ? JEV.OTHER_CATEGORY
      : params.categories[Number(single.choice) - 1]?.name;

  const twoUsage = [];
  const stages = [];
  const logger = { log: () => {} };
  const outcome = isTwoStageWorthwhile(params.categories)
    ? await categoriseInTwoStages({
        params,
        model,
        logger,
        askJev: async (request, questionId) => {
          const answer = await askJev(request, questionId, twoUsage);
          stages.push({
            questionId,
            choice: answer.choice,
            confidence: answer.confidence,
          });
          return answer;
        },
      })
    : null;
  return {
    provider: testCase.provider ?? null,
    reference: [].concat(testCase.reference),
    referenceFamily: assignFamily([].concat(testCase.reference)[0]),
    optionCounts: {
      single: params.categories.length + 1,
      family: buildFamilyOptions(params.categories).length + 1,
    },
    single: {
      name: singleName,
      confidence: single.confidence,
      tokens: singleUsage[0],
    },
    twoStage: outcome && {
      kind: outcome.kind,
      name:
        outcome.kind === TWO_STAGE_OUTCOMES.ACCEPTED
          ? outcome.result.categoryName
          : (outcome.pick?.categoryName ?? null),
      family:
        outcome.kind === TWO_STAGE_OUTCOMES.DECLINED
          ? (outcome.pick?.family?.family ?? null)
          : null,
      narrowTo:
        outcome.kind === TWO_STAGE_OUTCOMES.DECLINED
          ? (outcome.pick?.narrowToCategoryNames ?? null)
          : null,
      stages,
      tokens: twoUsage.reduce((sum, t) => sum + t, 0),
    },
  };
}

async function runAll(cases) {
  const results = new Array(cases.length);
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const index = next++;
      try {
        results[index] = await replayCase(cases[index]);
      } catch (error) {
        results[index] = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      process.stderr.write(".");
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stderr.write("\n");
  return results;
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const isRef = (row, name) => row.reference.some((r) => norm(r) === norm(name));
const inRefFamily = (row, name) =>
  Boolean(name) && assignFamily(name) === row.referenceFamily;

function summarise(rows) {
  const ok = rows.filter((r) => !r.error);
  const lines = [`cases ${rows.length}, errors ${rows.length - ok.length}`];
  const singleAccepted = ok.filter(
    (r) => r.single.confidence >= JEV.MIN_ACCEPTED_CONFIDENCE,
  );
  const singleRight = singleAccepted.filter((r) => isRef(r, r.single.name));
  lines.push(
    `single-stage @${JEV.MIN_ACCEPTED_CONFIDENCE}: accepted ${pct(singleAccepted.length, ok.length)} (${singleAccepted.length}), agree ${pct(singleRight.length, singleAccepted.length)}, in-family-wrong ${pct(singleAccepted.filter((r) => !isRef(r, r.single.name) && inRefFamily(r, r.single.name)).length, singleAccepted.length)}`,
  );
  lines.push(
    `single-stage any confidence: agree ${pct(ok.filter((r) => isRef(r, r.single.name)).length, ok.length)}`,
  );

  const two = ok.filter((r) => r.twoStage);
  const accepted = two.filter(
    (r) => r.twoStage.kind === TWO_STAGE_OUTCOMES.ACCEPTED,
  );
  const right = accepted.filter((r) => isRef(r, r.twoStage.name));
  const inFamilyWrong = accepted.filter(
    (r) => !isRef(r, r.twoStage.name) && inRefFamily(r, r.twoStage.name),
  );
  lines.push(
    `two-stage (${two.length} applicable): accepted ${pct(accepted.length, two.length)} (${accepted.length}), agree ${pct(right.length, accepted.length)}, in-family-wrong ${pct(inFamilyWrong.length, accepted.length)}, other-family-wrong ${pct(accepted.length - right.length - inFamilyWrong.length, accepted.length)}`,
  );
  const familyStage = two
    .map((r) => ({ r, s: r.twoStage.stages[0] }))
    .filter((x) => x.s);
  const familyAccepted = familyStage.filter(
    (x) => x.s.confidence >= JEV_TWO_STAGE.FAMILY_MIN_ACCEPTED_CONFIDENCE,
  );
  lines.push(
    `  stage 1 (family): accepted ${pct(familyAccepted.length, familyStage.length)}`,
  );
  const narrowed = two.filter((r) => r.twoStage.narrowTo);
  lines.push(
    `  stage 2 declined → Gemini on the family: ${narrowed.length}; reference inside that family ${pct(narrowed.filter((r) => r.twoStage.narrowTo.some((n) => isRef(r, n))).length, narrowed.length)}`,
  );
  const stageTwo = two.filter(
    (r) =>
      r.twoStage.stages.length === 2 &&
      r.twoStage.stages[1].choice !== JEV.OTHER_OPTION,
  );
  for (const threshold of STAGE_TWO_THRESHOLDS) {
    const take = stageTwo.filter(
      (r) => r.twoStage.stages[1].confidence >= threshold,
    );
    const good = take.filter((r) => isRef(r, r.twoStage.name));
    lines.push(
      `  stage-2 threshold ${threshold}: would accept ${take.length}/${stageTwo.length}, agree ${pct(good.length, take.length)}`,
    );
  }
  const tokens = (pick) => ok.map(pick).filter(Number.isFinite);
  const avg = (xs) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  lines.push(
    `Jev input tokens per case: single ${avg(tokens((r) => r.single.tokens))}, two-stage ${avg(tokens((r) => r.twoStage?.tokens))}`,
  );
  lines.push(
    `options: single ${avg(tokens((r) => r.optionCounts.single))}, family stage ${avg(tokens((r) => r.optionCounts.family))}`,
  );
  return lines.join("\n");
}

(async () => {
  const rows = await runAll(readCases());
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
  process.stdout.write(`== all rows\n${summarise(rows)}\n`);
  const llmLabelled = rows.filter(
    (row) => row.provider && row.provider !== JEV_DECISION_PROVIDER,
  );
  if (llmLabelled.length && llmLabelled.length < rows.length)
    process.stdout.write(
      `== LLM-labelled rows only\n${summarise(llmLabelled)}\n`,
    );
})();
