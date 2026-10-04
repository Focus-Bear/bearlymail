const definitions = require("../jev-evaluation-questions.json");
const {
  JEV,
  JEV_QUESTION_TYPES,
} = require("../../src/constants/jev.constants");
const {
  JEV_DECISION_REGISTRY,
} = require("../../src/llm/jev-decisions/jev-decision.registry");
const {
  buildDecisionState,
  withPolicyReference,
} = require("../../src/llm/jev-decisions/jev-decision-client");
const EVALUATION = {
  YES: 0.5,
  MAX_QUESTIONS: 100,
  SCORE_MAX: 4,
  PERCENT: 100,
};
const booleanQuestion = (instructions) => ({
  type: JEV_QUESTION_TYPES.NOUL,
  instructions,
});
function numberedEntries(text) {
  const lines = String(text || "")
    .split("\n")
    .filter((line) => line.trim());
  return lines.map((line, index) => {
    const match = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (!match || Number(match[1]) !== index + 1)
      throw new Error("Invalid numbered candidates");
    return match[2];
  });
}
function categoryLines(text) {
  return String(text)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^\s*- (.+?):\s*(.*)$/);
      if (!match) throw new Error("Invalid category fixture format");
      return { name: match[1], description: match[2] };
    });
}
// Fixture vars → the typed input each production call site passes.
const PRODUCTION_INPUTS = {
  "check-custom-exclusion-rules": (vars) => ({ rules: vars.rules }),
  "check-category-duplicate": (vars) => ({
    candidateNames: numberedEntries(vars.categoryList),
  }),
  "derive-mcp-sender-tool": (vars) => ({ tools: JSON.parse(vars.toolsJson) }),
  "merge-duplicate-categories": (vars) => ({
    categories: categoryLines(vars.categories),
  }),
};
const isProductionDecision = (suite) =>
  Object.hasOwn(JEV_DECISION_REGISTRY, suite);
function createProductionPlan(suite, vars, policy) {
  const definition = JEV_DECISION_REGISTRY[suite];
  const input = (PRODUCTION_INPUTS[suite] || (() => ({})))(vars);
  return {
    suite,
    definition,
    input,
    state: buildDecisionState({ prompt: policy }),
    questions: withPolicyReference(definition.questions(input)),
    vars,
  };
}
function createPlan(suite, vars, policy) {
  if (isProductionDecision(suite))
    return createProductionPlan(suite, vars, policy);
  if (!Object.hasOwn(definitions, suite))
    throw new Error("Unsupported evaluation suite");
  const questions = structuredClone(definitions[suite]);
  const candidates = [];
  if (suite === "batch-priority-triage") {
    for (const [index, thread] of vars.threads.entries()) {
      candidates.push(thread.key);
      questions[`thread_${index}`] = booleanQuestion(
        `Does this thread need full priority/category reanalysis under the supplied policy? Thread: ${JSON.stringify(thread)}`,
      );
    }
  }
  // With no goals or current work the prompt shows "No goals defined", so there
  // is nothing to align with; asking Jev anyway yields a flat, uncertain score.
  if (
    suite === "prioritise-email-prompts" &&
    !vars.goalsContext &&
    !vars.workingOnContext
  )
    delete questions.goalAlignmentScore;
  if (suite === "sanity-check-category-rule") {
    questions.betterCategory = {
      type: JEV_QUESTION_TYPES.CHOICE,
      instructions:
        "Assuming the verdict is reject, is one of the OTHER categories a better fit for the emails matched by this rule? Select its exact name, or none if rejection is for another reason.",
      criteria: { 0: "No better category" },
    };
    for (const line of String(vars.otherCategories || "")
      .split("\n")
      .filter((line) => line.trim())) {
      const match = line.match(/^\s*- (.+?) — (.+)$/);
      if (!match) throw new Error("Invalid alternate category fixture format");
      candidates.push(match[1]);
      questions.betterCategory.criteria[candidates.length] = line.trim();
    }
  }
  if (suite === "dispute-tone-check") {
    for (const [index, rule] of (vars.rules || []).entries()) {
      questions[`rule_${index}`] = booleanQuestion(
        `Assuming the dispute is accepted, should this EXACT rule be removed because it conflicts with the user's preferred style? Rule: ${rule}`,
      );
    }
  }
  if (suite === "search-ranking") {
    const lines = String(vars.emails)
      .split("\n")
      .filter((line) => line.trim());
    if (lines.length !== Number(vars.emailCount))
      throw new Error("Email candidate count mismatch");
    for (const [index, line] of lines.entries()) {
      const match = line.match(
        /^\s*(\d+)\.\s*(.*)Received:\s*(\d+) days ago.*$/,
      );
      if (!match || Number(match[1]) !== index)
        throw new Error("Invalid ranking fixture format");
      candidates.push({ index, daysAgo: Number(match[3]) });
      questions[`rank_${index}`] = {
        type: JEV_QUESTION_TYPES.SCORE,
        instructions: `Rate semantic relevance to the query of email ${index} ONLY. Ignore recency; code applies it. Email: ${line}`,
        criteria: [
          "Unrelated to query",
          "Barely relevant",
          "Somewhat relevant",
          "Strongly relevant",
          "Directly answers the query",
        ],
      };
      questions[`automated_${index}`] = booleanQuestion(
        `Is email ${index} an automated service message or newsletter? Email: ${line}`,
      );
    }
  }
  for (const question of Object.values(questions))
    if (
      question.type === JEV_QUESTION_TYPES.CHOICE &&
      Object.keys(question.criteria).length > JEV.MAX_OPTIONS
    )
      throw new Error("Too many Choice candidates");
  if (
    !Object.keys(questions).length ||
    Object.keys(questions).length > EVALUATION.MAX_QUESTIONS
  )
    throw new Error("Unsupported question count");
  return {
    suite,
    state: buildDecisionState({ prompt: policy }),
    questions: withPolicyReference(questions),
    candidates,
    vars,
  };
}
/** Suites the harness can evaluate: production decisions plus prompts still on generative models. */
const EVALUATION_SUITES = [
  ...Object.keys(JEV_DECISION_REGISTRY),
  ...Object.keys(definitions),
];
/** Suites whose decisions production routes to Jev. */
const ROUTED_SUITES = Object.keys(JEV_DECISION_REGISTRY);
module.exports = { createPlan, EVALUATION, EVALUATION_SUITES, ROUTED_SUITES };
