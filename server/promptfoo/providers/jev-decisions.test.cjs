const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Provider = require("./jev-decisions.cjs");
const { createPlan } = require("./jev-decision-plan.cjs");
const { compose } = require("./jev-decision-output.cjs");
const { JEV } = require("../../src/constants/jev.constants");
const originalFetch = global.fetch;
const originalKey = process.env[JEV.API_KEY_ENV];
const choice = (value, confidence = 1) => ({
  type: "choice",
  choice: value,
  confidence,
});
const noul = (value) => ({ type: "noul", noul: value });
afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env[JEV.API_KEY_ENV];
  else process.env[JEV.API_KEY_ENV] = originalKey;
});

test("routed suites use the production decision definitions", () => {
  const plan = createPlan("check-phishing-only", {}, "test policy");
  assert.equal(plan.state.policyAndInput, "test policy");
  const uncertain = compose(plan, { risk: choice("uncertain") });
  assert.equal(uncertain.generationRequired, true);
  const legitimate = compose(plan, { risk: choice("legitimate") });
  assert.deepEqual(legitimate.output, { phishing: null });
  assert.equal(legitimate.uncertain, false);
});

test("tool selection copies an exact valid schema pair and only admits string arguments", () => {
  const vars = {
    toolsJson: JSON.stringify([
      {
        name: "look_up",
        inputSchema: {
          properties: { email: { type: "string" }, count: { type: "number" } },
        },
      },
    ]),
  };
  const plan = createPlan("derive-mcp-sender-tool", vars, "test policy");
  assert.equal(Object.keys(plan.questions.tool.criteria).length, 2);
  assert.deepEqual(compose(plan, { tool: choice("1") }).output, {
    toolName: "look_up",
    emailArgName: "email",
  });
  assert.deepEqual(compose(plan, { tool: choice("0") }).output, {
    toolName: null,
    emailArgName: null,
  });
});

test("any duplicate pair hands the merge to the generative model", () => {
  const plan = createPlan(
    "merge-duplicate-categories",
    { categories: "- A: first\n- B: second\n- C: third" },
    "test",
  );
  const result = compose(plan, {
    pair_0_1: noul(0),
    pair_0_2: noul(0),
    pair_1_2: noul(1),
  });
  assert.equal(result.generationRequired, true);
});

test("unused speculative rule answers do not force escalation for a rejected dispute", () => {
  const plan = createPlan(
    "dispute-tone-check",
    { rules: ["Be polite"] },
    "test",
  );
  const result = compose(plan, { accepted: noul(0), rule_0: noul(0.5) });
  assert.deepEqual(result.output.rulesToRemove, []);
  assert.equal(result.uncertain, false);
});

test("independent tone warnings request generation even when the tone is acceptable", () => {
  const result = compose(
    { suite: "check-tone-style" },
    {
      toneChanges: noul(0),
      attachment: noul(1),
      timing: noul(0),
      recipient: noul(0),
    },
  );
  assert.equal(result.output.isOk, true);
  assert.equal(result.generationRequired, true);
});

test("ranking retains every index and caps automated messages without recency bonuses", () => {
  const plan = {
    suite: "search-ranking",
    candidates: [
      { index: 0, daysAgo: 0 },
      { index: 1, daysAgo: 90 },
    ],
  };
  const score = { type: "score", score: 4, confidence: 1 };
  const output = compose(plan, {
    rank_0: score,
    rank_1: score,
    automated_0: noul(1),
    automated_1: noul(0),
  }).output;
  assert.deepEqual(output, [
    { index: 1, relevanceScore: 70 },
    { index: 0, relevanceScore: 25 },
  ]);
});

test("oversized or malformed candidate lists fail before requesting a judgment", () => {
  assert.throws(() =>
    createPlan(
      "check-category-duplicate",
      { categoryList: "1. A\n1. B" },
      "test",
    ),
  );
  assert.throws(() =>
    createPlan(
      "check-category-duplicate",
      {
        categoryList: Array.from(
          { length: JEV.MAX_OPTIONS },
          (_, index) => `${index + 1}. C`,
        ).join("\n"),
      },
      "test",
    ),
  );
});

test("missing credentials cause no network access", async () => {
  delete process.env[JEV.API_KEY_ENV];
  global.fetch = () => {
    throw new Error("Unexpected network");
  };
  const response = await new Provider({
    config: { suite: "check-phishing-only" },
  }).callApi("test", { vars: {} });
  assert.match(response.error, /Missing Jev API key/);
});

test("raw evaluation reports Jev failures without falling back or sending to another provider", async () => {
  process.env[JEV.API_KEY_ENV] = "test-only";
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    return { ok: false, status: 429 };
  };
  const response = await new Provider({
    config: { suite: "check-phishing-only" },
  }).callApi("test", { vars: {} });
  assert.equal(response.error, "Jev HTTP 429");
  assert.deepEqual(urls, [JEV.API_URL]);
});

test("synthetic assertions are executable statement blocks, and expected answers are not model inputs", () => {
  const fixtures = require("../jev-synthetic-fixtures.cjs");
  for (const suite of Object.values(fixtures))
    for (const fixture of suite.tests) {
      assert.equal(Object.hasOwn(fixture.vars, "expected"), false);
      for (const assertion of fixture.assert) {
        assert.ok(assertion.value.includes("\n"));
        assert.doesNotThrow(() => new Function("output", assertion.value));
      }
    }
});

test("priority skips goal alignment when the user has no goals or current work", () => {
  const vars = { emailCategories: '1. "Work"' };
  const plan = createPlan("prioritise-email-prompts", vars, "test");
  assert.equal(plan.questions.goalAlignmentScore, undefined);
  const result = compose(plan, {
    urgencyScore: { type: "score", score: 2, confidence: 1 },
    newsletter: noul(0),
  });
  assert.equal(result.output.result.goalAlignmentScore, 0);
  assert.equal(result.uncertain, false);
  const withGoals = createPlan(
    "prioritise-email-prompts",
    { ...vars, goalsContext: "Close the Series A" },
    "test",
  );
  assert.ok(withGoals.questions.goalAlignmentScore);
});
