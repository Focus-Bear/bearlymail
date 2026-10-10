const { EVALUATION } = require("./jev-decision-plan.cjs");
const { JEV_DECISIONS } = require("../../src/constants/jev.constants");
const {
  jevAnswerConfidence: confidence,
} = require("../../src/llm/jev-decisions/jev-answer.helpers");
const yes = (answer) => answer.noul >= EVALUATION.YES;
const verdictText = (value) =>
  `Jev decision: ${value}. No generated explanation.`;
function composeProduction(plan, answers) {
  const outcome = plan.definition.compose(plan.input, answers);
  return {
    ...outcome,
    uncertain: outcome.usedKeys.some(
      (key) => confidence(answers[key]) < plan.definition.minConfidence,
    ),
  };
}
function compose(plan, answers) {
  if (plan.definition) return composeProduction(plan, answers);
  const used = new Set();
  const read = (key) => {
    used.add(key);
    return answers[key];
  };
  const bool = (key) => yes(read(key));
  const pick = (key) => read(key).choice;
  let output;
  let generationRequired = false;
  switch (plan.suite) {
    case "detect-opt-out":
      output = {
        isOptOut: bool("isOptOut"),
        confidence: confidence(read("isOptOut")),
        reason: verdictText("opt-out"),
      };
      break;
    case "batch-priority-triage":
      output = {
        results: plan.candidates.map((key, index) => ({
          key,
          needsReanalysis: bool(`thread_${index}`),
          reason: verdictText("reanalysis"),
        })),
      };
      break;
    case "prioritise-email-prompts": {
      const newsletter = bool("newsletter");
      const urgencyScore = newsletter
        ? 0
        : Math.round(
            (read("urgencyScore").score / EVALUATION.SCORE_MAX) *
              EVALUATION.PERCENT,
          );
      const goalAlignmentScore = plan.questions.goalAlignmentScore
        ? Math.round(
            (read("goalAlignmentScore").score / EVALUATION.SCORE_MAX) *
              EVALUATION.PERCENT,
          )
        : 0;
      const categoryName = String(plan.vars.emailCategories).match(
        /1\.\s*\"([^\"]+)\"/,
      )?.[1];
      output = {
        result: {
          urgencyScore,
          goalAlignmentScore: newsletter
            ? Math.min(20, goalAlignmentScore)
            : goalAlignmentScore,
          urgencyExplanation: verdictText("urgency score"),
          goalAlignmentExplanation: verdictText("goal alignment"),
          categoryNumber: 1,
          categoryName,
          categoryConfidence: "HIGH",
          categoryExplanation: "Category already assigned upstream.",
          reasoning: verdictText("priority scores"),
        },
      };
      break;
    }
    case "sanity-check-category-rule": {
      const verdict = pick("verdict");
      output = {
        verdict,
        confidence: confidence(read("verdict")),
        reason: verdictText(verdict),
        betterCategoryName:
          verdict === "reject"
            ? plan.candidates[Number(pick("betterCategory")) - 1] || null
            : null,
        suggestedRevision: null,
      };
      generationRequired = verdict === "revise";
      break;
    }
    case "assess-category-rule-value":
      output = {
        makesSense: bool("makesSense"),
        addsValue: bool("addsValue"),
        reasoning: verdictText("rule value"),
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
      };
      generationRequired = bool("needsExclusions");
      break;
    case "validate-writing-example": {
      const valid = bool("isValid");
      output = valid
        ? { status: "valid", cleanedText: null }
        : { status: "rejected", reason: verdictText("invalid writing sample") };
      generationRequired = valid;
      break;
    }
    case "detect-meeting-proposal":
      output = {
        hasProposal: bool("hasProposal"),
        bookingInvited: bool("bookingInvited"),
        proposedLocalTime: null,
        proposedLocalTimeEnd: null,
        proposedLocalDate: null,
        proposedTimezone: null,
        proposedTimeText: null,
        topic: null,
        durationMinutes: null,
      };
      generationRequired = output.hasProposal || output.bookingInvited;
      break;
    case "check-tone-style":
      output = {
        isOk: !bool("toneChanges"),
        significance: "low",
        suggestions: [],
        revisedText: null,
        attachmentReminder: null,
        inappropriateTiming: null,
        recipientMismatch: null,
      };
      {
        const warnings = ["attachment", "timing", "recipient"].map(bool);
        generationRequired = !output.isOk || warnings.some(Boolean);
      }
      break;
    case "dispute-tone-check": {
      const accepted = bool("accepted");
      output = {
        accepted,
        rulesToRemove: accepted
          ? (plan.vars.rules || []).filter((_, index) => bool(`rule_${index}`))
          : [],
        explanation: verdictText(
          accepted ? "dispute accepted" : "dispute rejected",
        ),
      };
      break;
    }
    case "suggest-actions":
      output = {
        actions: Object.keys(plan.questions)
          .filter((key) => bool(key))
          .map((type) => ({
            type,
            confidence: read(type).noul,
            reason: verdictText(type),
            metadata: {},
          })),
      };
      break;
    case "search-ranking":
      output = plan.candidates
        .map(({ index, daysAgo }) => {
          const base =
            (read(`rank_${index}`).score / EVALUATION.SCORE_MAX) *
            EVALUATION.PERCENT;
          const automated = bool(`automated_${index}`);
          const bonus =
            daysAgo === 0
              ? 30
              : daysAgo <= 1
                ? 25
                : daysAgo <= 7
                  ? 20
                  : daysAgo <= 30
                    ? 5
                    : daysAgo <= 60
                      ? -20
                      : -30;
          return {
            index,
            relevanceScore: Math.round(
              automated
                ? Math.min(25, base)
                : Math.min(100, Math.max(0, base + bonus)),
            ),
          };
        })
        .sort(
          (a, b) => b.relevanceScore - a.relevanceScore || a.index - b.index,
        );
      break;
    default:
      throw new Error("Unsupported output contract");
  }
  return {
    output,
    generationRequired,
    usedKeys: [...used],
    uncertain: [...used].some(
      (key) => confidence(answers[key]) < JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    ),
  };
}
module.exports = { compose };
