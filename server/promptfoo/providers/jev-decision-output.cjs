const { EVALUATION } = require("./jev-decision-plan.cjs");
const { JEV_QUESTION_TYPES } = require("../../src/constants/jev.constants");
const yes = (answer) => answer.noul >= EVALUATION.YES;
// Jev's documented Noul confidence (distance from 0.5), so Nouls share the
// Choice/Score scale and one threshold means the same thing for every type.
const confidence = (answer) =>
  answer.type === JEV_QUESTION_TYPES.NOUL
    ? Math.abs(2 * answer.noul - 1)
    : answer.confidence;
const verdictText = (value) =>
  `Jev decision: ${value}. No generated explanation.`;
function compose(plan, answers) {
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
    case "evaluate-workflow-condition":
      output = { matches: bool("matches") };
      break;
    case "check-custom-exclusion-rules":
      output = {
        matched: pick("rule") !== "0",
        matchedRule: plan.candidates[Number(pick("rule")) - 1] || null,
        reason: verdictText("exclusion match"),
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
    case "check-phishing-only": {
      const risk = pick("risk");
      const certainty = confidence(read("risk"));
      output = {
        phishing:
          risk === "legitimate"
            ? null
            : {
                is_phishing: risk === "phishing",
                confidence:
                  risk === "uncertain"
                    ? "low"
                    : certainty >= EVALUATION.HIGH
                      ? "high"
                      : certainty >= EVALUATION.MEDIUM
                        ? "medium"
                        : "low",
                reason: verdictText(risk),
              },
      };
      generationRequired = risk === "uncertain";
      break;
    }
    case "classify-contact-type":
      output = {
        contactType: pick("contactType"),
        confidence: confidence(read("contactType")),
        reasoning: verdictText(pick("contactType")),
      };
      break;
    case "classify-email-type":
      output = {
        ...Object.fromEntries(
          [
            "isAutomated",
            "isNewsletter",
            "isColdOutreach",
            "isOutOfOffice",
          ].map((key) => [key, bool(key)]),
        ),
        personalizationScore:
          read("personalizationScore").score / EVALUATION.SCORE_MAX,
        urgencyLevel: pick("urgencyLevel"),
        reasons: [verdictText("email classification")],
      };
      break;
    case "verify-distraction-phrase":
      output = { verified: bool("verified") };
      break;
    case "incremental-priority-check":
      output = {
        result: {
          needsFullRecalc: bool("needsFullRecalc"),
          categoryMightChange: bool("categoryMightChange"),
          suggestedUrgencyDelta: Math.round(
            read("urgencyChange").score * EVALUATION.URGENCY_STEP +
              EVALUATION.URGENCY_MIN,
          ),
          reason: verdictText("priority change"),
        },
      };
      break;
    case "check-category-duplicate":
      output = {
        duplicateNumber: Number(pick("duplicate")),
        reasoning: verdictText(`duplicate ${pick("duplicate")}`),
      };
      break;
    case "derive-mcp-sender-tool":
      output = plan.candidates[Number(pick("tool")) - 1] || {
        toolName: null,
        emailArgName: null,
      };
      break;
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
    case "merge-duplicate-categories": {
      const groups = [];
      for (let index = 0; index < plan.candidates.length; index++) {
        // Complete-link grouping avoids merging A and C merely because both match B.
        const group = groups.find((members) =>
          members.every((member) => bool(`pair_${member}_${index}`)),
        );
        if (group) group.push(index);
        else groups.push([index]);
      }
      output = {
        duplicate_groups: groups
          .filter((group) => group.length > 1)
          .map((group) => ({
            canonical: plan.candidates[group[0]].name,
            members: group.map((index) => plan.candidates[index].name),
          })),
      };
      break;
    }
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
      (key) => confidence(answers[key]) < EVALUATION.HIGH,
    ),
  };
}
module.exports = { compose, confidence };
