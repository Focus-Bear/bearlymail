import { JEV, JEV_TWO_STAGE } from "../constants/jev.constants";
import { PERCENTAGES } from "../constants/percentages";
import { OTHER_FAMILY } from "../context/category-family.taxonomy";
import type { LoggerPort } from "../shared/email-intelligence/ports";
import type { JevDeclinedPick } from "./jev-category-client";
import {
  buildFamilyOptions,
  buildJevFamilyRequest,
  type FamilyOption,
} from "./jev-category-families";
import {
  buildJevCategoryRequest,
  type JevCategoryAnswer,
} from "./jev-category-request";
import {
  JEV_OUTCOMES,
  JEV_STAGES,
  type JevStage,
  logJevConfidence,
  runnerUpMargin,
} from "./jev-confidence-log";
import type { JevRequest } from "./jev-system-one";
import type {
  CategoriseFromSummaryParams,
  CategoriseFromSummaryResult,
} from "./llm-categorise-summary";

/** Sends one Jev Choice request and returns the answer to `questionId`. */
export type AskJev = (
  request: JevRequest,
  questionId: string,
) => Promise<JevCategoryAnswer>;

export const TWO_STAGE_OUTCOMES = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
} as const;

export type TwoStageOutcome =
  | {
      kind: typeof TWO_STAGE_OUTCOMES.ACCEPTED;
      result: CategoriseFromSummaryResult;
    }
  | {
      kind: typeof TWO_STAGE_OUTCOMES.DECLINED;
      pick: JevDeclinedPick | null;
    };

/** What both stages need: the thread, the Jev model and how to ask it. */
export interface TwoStageContext {
  params: CategoriseFromSummaryParams;
  model: string;
  askJev: AskJev;
  logger: Pick<LoggerPort, "log">;
}

const DECLINED_WITHOUT_PICK: TwoStageOutcome = {
  kind: TWO_STAGE_OUTCOMES.DECLINED,
  pick: null,
};

function percent(confidence: number): number {
  return Math.round(confidence * PERCENTAGES.ONE_HUNDRED);
}

function categoryNameAt(
  params: CategoriseFromSummaryParams,
  index: number | undefined,
): string | null {
  return index === undefined ? null : (params.categories[index]?.name ?? null);
}

/**
 * Categorises in two Jev calls: the family (few options, so Jev can be sure),
 * then the category within it. A one-member family or a lone unfamilied
 * category is decided by stage 1 alone. Stage 1 declining hands the thread to
 * the unchanged Gemini path; stage 2 declining hands Gemini the family's
 * categories to choose between.
 */
export async function categoriseInTwoStages(
  context: TwoStageContext,
): Promise<TwoStageOutcome> {
  const { params, model, askJev, logger } = context;
  const options = buildFamilyOptions(params.categories);
  const familyAnswer = await askJev(
    buildJevFamilyRequest(params, options, model),
    JEV_TWO_STAGE.FAMILY_QUESTION_ID,
  );
  const isFamilyAccepted =
    familyAnswer.confidence >= JEV_TWO_STAGE.FAMILY_MIN_ACCEPTED_CONFIDENCE;
  logStage(logger, JEV_STAGES.FAMILY, familyAnswer, {
    isAccepted: isFamilyAccepted,
    threshold: JEV_TWO_STAGE.FAMILY_MIN_ACCEPTED_CONFIDENCE,
    optionCount: options.length + 1,
  });

  if (familyAnswer.choice === JEV.OTHER_OPTION) {
    return isFamilyAccepted
      ? acceptedResult(
          null,
          JEV.OTHER_CATEGORY,
          `Jev found no fitting category (choice confidence ${percent(familyAnswer.confidence)}%).`,
        )
      : DECLINED_WITHOUT_PICK;
  }
  const option = options[Number(familyAnswer.choice) - 1];
  if (!option) throw new Error("Jev chose an unknown family");
  const familyPick = {
    family: option.family ?? OTHER_FAMILY,
    confidence: familyAnswer.confidence,
  };

  if (option.categoryIndexes.length === 1) {
    const [index] = option.categoryIndexes;
    const categoryName = categoryNameAt(params, index);
    if (!categoryName) throw new Error("Jev chose an unknown category");
    if (!isFamilyAccepted)
      return declined(categoryName, familyAnswer.confidence, familyPick);
    return acceptedResult(
      index + 1,
      categoryName,
      `Jev selected "${categoryName}" (choice confidence ${percent(familyAnswer.confidence)}%).`,
    );
  }
  if (!isFamilyAccepted)
    return declined(null, familyAnswer.confidence, familyPick);

  return chooseWithinFamily(context, option, familyPick);
}

async function chooseWithinFamily(
  context: TwoStageContext,
  option: FamilyOption,
  familyPick: { family: string; confidence: number },
): Promise<TwoStageOutcome> {
  const { params, model, askJev, logger } = context;
  const members = option.categoryIndexes.map(
    (index) => params.categories[index],
  );
  const categoryAnswer = await askJev(
    buildJevCategoryRequest({ ...params, categories: members }, model),
    JEV.QUESTION_ID,
  );
  const isCategoryAccepted =
    categoryAnswer.confidence >= JEV_TWO_STAGE.CATEGORY_MIN_ACCEPTED_CONFIDENCE;
  logStage(logger, JEV_STAGES.CATEGORY, categoryAnswer, {
    isAccepted: isCategoryAccepted,
    threshold: JEV_TWO_STAGE.CATEGORY_MIN_ACCEPTED_CONFIDENCE,
    optionCount: members.length + 1,
  });

  // Other inside a confidently chosen family contradicts stage 1, so the
  // narrowed list is not trusted either: the full Gemini path decides.
  if (categoryAnswer.choice === JEV.OTHER_OPTION) return DECLINED_WITHOUT_PICK;
  const index = option.categoryIndexes[Number(categoryAnswer.choice) - 1];
  const categoryName = categoryNameAt(params, index);
  if (index === undefined || !categoryName)
    throw new Error("Jev chose an unknown category");
  if (!isCategoryAccepted) {
    return declined(categoryName, categoryAnswer.confidence, familyPick, {
      narrowToCategoryNames: members.map((member) => member.name),
    });
  }
  return acceptedResult(
    index + 1,
    categoryName,
    `Jev selected "${categoryName}" in the ${familyPick.family} family (family confidence ${percent(familyPick.confidence)}%, category confidence ${percent(categoryAnswer.confidence)}%).`,
  );
}

function acceptedResult(
  categoryNumber: number | null,
  categoryName: string,
  reasoning: string,
): TwoStageOutcome {
  return {
    kind: TWO_STAGE_OUTCOMES.ACCEPTED,
    result: {
      categoryNumber: categoryNumber ?? Number(JEV.OTHER_OPTION),
      categoryName,
      categoryConfidence: "HIGH",
      reasoning,
    },
  };
}

function declined(
  categoryName: string | null,
  confidence: number,
  family: { family: string; confidence: number },
  extra: Pick<JevDeclinedPick, "narrowToCategoryNames"> = {},
): TwoStageOutcome {
  return {
    kind: TWO_STAGE_OUTCOMES.DECLINED,
    pick: {
      categoryName,
      confidence,
      family,
      decision: JEV_TWO_STAGE.DECISION,
      ...extra,
    },
  };
}

function logStage(
  logger: Pick<LoggerPort, "log">,
  stage: JevStage,
  answer: JevCategoryAnswer,
  details: { isAccepted: boolean; threshold: number; optionCount: number },
): void {
  logJevConfidence(logger, {
    decision: JEV_TWO_STAGE.DECISION,
    outcome: details.isAccepted
      ? JEV_OUTCOMES.ACCEPTED
      : JEV_OUTCOMES.BELOW_THRESHOLD,
    confidence: answer.confidence,
    threshold: details.threshold,
    optionCount: details.optionCount,
    choseNoneOption: answer.choice === JEV.OTHER_OPTION,
    runnerUpMargin: runnerUpMargin(answer.probabilities ?? {}),
    stage,
  });
}
