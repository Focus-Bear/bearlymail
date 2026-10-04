import {
  JEV_DECISION_KINDS,
  JEV_DECISIONS,
  JEV_QUESTION_TYPES,
} from "../../constants/jev.constants";
import {
  isYes,
  noulQuestion,
  numberedChoiceQuestion,
  pickNumbered,
  scored,
  trackAnswers,
} from "./jev-answer.helpers";
import type {
  JevDecisionRegistry,
  McpToolCandidate,
} from "./jev-decision.types";

// Maps the five urgency-change levels onto the prompt's -30..+30 delta.
const URGENCY_DELTA = { STEP: 15, MIN: -30 } as const;
const STRING_SCHEMA_TYPE = "string";

/** Every (tool, string argument) pair that could carry a sender's email. */
function emailArgumentCandidates(tools: McpToolCandidate[]) {
  return tools.flatMap((tool) =>
    Object.entries(tool.inputSchema?.properties ?? {})
      .filter(([, schema]) => schema.type === STRING_SCHEMA_TYPE)
      .map(([argument]) => ({
        toolName: tool.name,
        emailArgName: argument,
        description: tool.description ?? "",
      })),
  );
}

type PriorityAndToolKinds =
  | typeof JEV_DECISION_KINDS.INCREMENTAL_PRIORITY
  | typeof JEV_DECISION_KINDS.MCP_SENDER_TOOL;

export const PRIORITY_AND_TOOL_DECISIONS: Pick<
  JevDecisionRegistry,
  PriorityAndToolKinds
> = {
  [JEV_DECISION_KINDS.INCREMENTAL_PRIORITY]: {
    minConfidence: JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    questions: () => ({
      needsFullRecalc: noulQuestion(
        "Does the new message require full priority recalculation?",
      ),
      categoryMightChange: noulQuestion(
        "Does the new message materially change the appropriate thread category?",
      ),
      urgencyChange: {
        type: JEV_QUESTION_TYPES.SCORE,
        instructions:
          "How much has urgency changed relative to the prior thread?",
        criteria: [
          "Major decrease: resolved urgent issue (-30)",
          "Moderate decrease (-15)",
          "No material urgency change (0)",
          "Moderate increase (+15)",
          "Major increase: new emergency (+30)",
        ],
      },
    }),
    compose: (_input, answers) => {
      const tracked = trackAnswers(answers);
      const needsFullRecalc = isYes(tracked.read("needsFullRecalc"));
      // The delta is only applied when the full recalculation is skipped, and
      // nothing reads categoryMightChange, so neither gates a recalculation.
      const urgencyChange = needsFullRecalc
        ? answers.urgencyChange
        : tracked.read("urgencyChange");
      const suggestedUrgencyDelta = Math.round(
        scored(urgencyChange) * URGENCY_DELTA.STEP + URGENCY_DELTA.MIN,
      );
      return {
        output: {
          result: {
            needsFullRecalc,
            categoryMightChange: isYes(answers.categoryMightChange),
            suggestedUrgencyDelta,
            reason: "Jev decision (no generated explanation)",
          },
        },
        generationRequired: false,
        usedKeys: tracked.usedKeys(),
      };
    },
  },
  [JEV_DECISION_KINDS.MCP_SENDER_TOOL]: {
    minConfidence: JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    questions: ({ tools }) => ({
      tool: numberedChoiceQuestion(
        "Select the best read-only tool and exact input argument for looking up a person or company by email address. Prefer explicit email fields over a generic query. Never select a write, create or send operation.",
        "No suitable tool",
        emailArgumentCandidates(tools).map((candidate) =>
          JSON.stringify(candidate),
        ),
      ),
    }),
    compose: ({ tools }, answers) => {
      const tracked = trackAnswers(answers);
      const candidate = pickNumbered(
        tracked.read("tool"),
        emailArgumentCandidates(tools),
      );
      return {
        output: {
          toolName: candidate?.toolName ?? null,
          emailArgName: candidate?.emailArgName ?? null,
        },
        generationRequired: false,
        usedKeys: tracked.usedKeys(),
      };
    },
  },
};
