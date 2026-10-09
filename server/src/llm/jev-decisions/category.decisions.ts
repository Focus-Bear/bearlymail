import {
  JEV_DECISION_KINDS,
  JEV_DECISIONS,
} from "../../constants/jev.constants";
import type { JevAnswer } from "../jev-system-one";
import {
  chosen,
  formatConfidence,
  isYes,
  noulQuestion,
  numberedChoiceQuestion,
  pickNumbered,
  trackAnswers,
} from "./jev-answer.helpers";
import type { JevDecisionRegistry } from "./jev-decision.types";

const pairKey = (first: number, second: number) => `pair_${first}_${second}`;

function categoryPairs(count: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let first = 0; first < count; first++)
    for (let second = first + 1; second < count; second++)
      pairs.push([first, second]);
  return pairs;
}

function duplicateReasoning(answer: JevAnswer, matchedName: string | null) {
  const confidence = formatConfidence(answer);
  return matchedName
    ? `Jev judged this equivalent to "${matchedName}" (confidence ${confidence}).`
    : `Jev found no equivalent existing category (confidence ${confidence}).`;
}

type CategoryKinds =
  | typeof JEV_DECISION_KINDS.MERGE_DUPLICATE_CATEGORIES
  | typeof JEV_DECISION_KINDS.CATEGORY_DUPLICATE;

export const CATEGORY_DECISIONS: Pick<JevDecisionRegistry, CategoryKinds> = {
  // Jev confirms "no duplicates"; when it finds a group, the existing model
  // chooses the groups and the clearest canonical name.
  [JEV_DECISION_KINDS.MERGE_DUPLICATE_CATEGORIES]: {
    minConfidence: JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    questions: ({ categories }) => {
      const pairs = categoryPairs(categories.length);
      if (!pairs.length || pairs.length > JEV_DECISIONS.MAX_QUESTIONS)
        throw new Error("Unsupported category count for pairwise comparison");
      return Object.fromEntries(
        pairs.map(([first, second]) => [
          pairKey(first, second),
          noulQuestion(
            `Are these two categories true duplicates that would collect the same emails, not merely related? Keep bot vs human, QA pass vs fail and distinct meeting subtypes separate. First: ${JSON.stringify(categories[first])}. Second: ${JSON.stringify(categories[second])}.`,
          ),
        ]),
      );
    },
    compose: ({ categories }, answers) => {
      const tracked = trackAnswers(answers);
      // Every "no" is read and confidence-gated; the first "yes" hands the
      // whole merge to the generative model.
      const hasDuplicatePair = categoryPairs(categories.length).some(
        ([first, second]) => isYes(tracked.read(pairKey(first, second))),
      );
      return {
        output: { duplicate_groups: [] },
        generationRequired: hasDuplicatePair,
        usedKeys: tracked.usedKeys(),
      };
    },
  },
  [JEV_DECISION_KINDS.CATEGORY_DUPLICATE]: {
    minConfidence: JEV_DECISIONS.STANDARD_MIN_CONFIDENCE,
    questions: ({ candidateNames }) => ({
      duplicate: numberedChoiceQuestion(
        "Which existing category is semantically equivalent to the proposed category? Related topics, umbrella categories and sub-topics are not duplicates.",
        "No duplicate",
        candidateNames,
      ),
    }),
    compose: ({ candidateNames }, answers) => {
      const tracked = trackAnswers(answers);
      const answer = tracked.read("duplicate");
      const matchedName = pickNumbered(answer, candidateNames);
      return {
        output: {
          duplicateNumber: Number(chosen(answer)),
          reasoning: duplicateReasoning(answer, matchedName),
        },
        generationRequired: false,
        usedKeys: tracked.usedKeys(),
      };
    },
  },
};
