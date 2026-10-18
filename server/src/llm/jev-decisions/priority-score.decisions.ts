import {
  JEV_DECISION_KINDS,
  JEV_DECISIONS,
  JEV_PRIORITY_LEVELS,
  JEV_QUESTION_TYPES,
} from "../../constants/jev.constants";
import type { JevAnswer, JevQuestion } from "../jev-system-one";
import {
  formatConfidence,
  isYes,
  noulQuestion,
  scored,
  trackAnswers,
} from "./jev-answer.helpers";
import type { JevDecisionRegistry } from "./jev-decision.types";

type PriorityLevel = { label: string; score: number };

const CATEGORY_ALREADY_ASSIGNED = "Category already assigned upstream.";
const ASSIGNED_CATEGORY_NUMBER = 1;

function levelQuestion(
  instructions: string,
  levels: readonly PriorityLevel[],
): JevQuestion {
  return {
    type: JEV_QUESTION_TYPES.SCORE,
    instructions,
    criteria: levels.map((level) => `${level.label}: ${level.score}`),
  };
}

/** Jev's score is an expected level index, so interpolate between levels. */
function levelScore(answer: JevAnswer, levels: readonly PriorityLevel[]) {
  const position = scored(answer);
  const lower = levels[Math.floor(position)];
  const upper = levels[Math.ceil(position)];
  const fraction = position - Math.floor(position);
  return Math.round(lower.score + (upper.score - lower.score) * fraction);
}

/** An honest verdict line: Jev returns levels, never a written rationale. */
function levelExplanation(
  answer: JevAnswer,
  levels: readonly PriorityLevel[],
): string {
  const nearest = levels[Math.round(scored(answer))];
  return `Jev rated this "${nearest.label}" (confidence ${formatConfidence(answer)}). No written explanation.`;
}

function newsletterExplanation(answer: JevAnswer): string {
  return `Jev identified a newsletter or mass email (confidence ${formatConfidence(answer)}). No written explanation.`;
}

type PriorityScoreKinds = typeof JEV_DECISION_KINDS.PRIORITY_SCORES;

/**
 * Urgency and goal alignment for `prioritise-email.md`, in the same JSON
 * contract `PriorityAnalysisService.parsePriorityResponse` reads. The category
 * is assigned before this step, so it is echoed back as category 1.
 */
export const PRIORITY_SCORE_DECISIONS: Pick<
  JevDecisionRegistry,
  PriorityScoreKinds
> = {
  [JEV_DECISION_KINDS.PRIORITY_SCORES]: {
    minConfidence: JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    questions: ({ hasGoals }) => ({
      newsletter: noulQuestion(
        "Is this a newsletter, digest or mass promotional email?",
      ),
      urgencyScore: levelQuestion(
        "Score current urgency under the supplied policy, including deadlines, imminent cancellations, resolved threads, and mass-email exceptions. Do not score importance as urgency.",
        JEV_PRIORITY_LEVELS.URGENCY,
      ),
      ...(hasGoals && {
        goalAlignmentScore: levelQuestion(
          "Score alignment with the stated user goals under the supplied policy. No evidence of connection means low alignment. Newsletters must stay low.",
          JEV_PRIORITY_LEVELS.GOAL_ALIGNMENT,
        ),
      }),
    }),
    compose: ({ assignedCategoryName, hasGoals }, answers) => {
      const tracked = trackAnswers(answers);
      const newsletterAnswer = tracked.read("newsletter");
      const isNewsletter = isYes(newsletterAnswer);
      const urgency = isNewsletter ? null : tracked.read("urgencyScore");
      const goal = hasGoals ? tracked.read("goalAlignmentScore") : null;
      const goalScore = goal
        ? levelScore(goal, JEV_PRIORITY_LEVELS.GOAL_ALIGNMENT)
        : JEV_PRIORITY_LEVELS.NO_GOALS_ALIGNMENT;
      return {
        output: {
          result: {
            urgencyScore: urgency
              ? levelScore(urgency, JEV_PRIORITY_LEVELS.URGENCY)
              : JEV_PRIORITY_LEVELS.NEWSLETTER_URGENCY,
            urgencyExplanation: urgency
              ? levelExplanation(urgency, JEV_PRIORITY_LEVELS.URGENCY)
              : newsletterExplanation(newsletterAnswer),
            goalAlignmentScore: isNewsletter
              ? Math.min(
                  JEV_PRIORITY_LEVELS.NEWSLETTER_MAX_GOAL_ALIGNMENT,
                  goalScore,
                )
              : goalScore,
            goalAlignmentExplanation: goal
              ? levelExplanation(goal, JEV_PRIORITY_LEVELS.GOAL_ALIGNMENT)
              : "No goals or current work defined to align with.",
            categoryNumber: ASSIGNED_CATEGORY_NUMBER,
            categoryName: assignedCategoryName,
            categoryConfidence: "HIGH",
            categoryExplanation: CATEGORY_ALREADY_ASSIGNED,
            reasoning: "Jev decision (no generated explanation)",
          },
        },
        generationRequired: false,
        usedKeys: tracked.usedKeys(),
      };
    },
  },
};
