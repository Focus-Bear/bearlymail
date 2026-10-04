import { JEV, JEV_QUESTION_TYPES } from "../../constants/jev.constants";
import { PERCENTAGES } from "../../constants/percentages";
import type { JevAnswer, JevQuestion } from "../jev-system-one";

const NOUL_YES = 0.5;
const NO_MATCH_OPTION = "0";

/**
 * Jev's documented confidence for every answer type. Nouls carry none, so use
 * the distance from 0.5, which puts them on the Choice/Score scale.
 */
export function jevAnswerConfidence(answer: JevAnswer): number {
  if (answer.type === JEV_QUESTION_TYPES.NOUL)
    return Math.abs(2 * answer.noul - 1);
  return answer.confidence;
}

export function formatConfidence(answer: JevAnswer): string {
  return `${Math.round(jevAnswerConfidence(answer) * PERCENTAGES.ONE_HUNDRED)}%`;
}

export function noulQuestion(instructions: string): JevQuestion {
  return { type: JEV_QUESTION_TYPES.NOUL, instructions };
}

/**
 * A Choice over `options` (numbered from 1) plus a "0" option for none of
 * them, so the answer maps back to an exact input item.
 */
export function numberedChoiceQuestion(
  instructions: string,
  noneLabel: string,
  options: string[],
): JevQuestion {
  if (!options.length || options.length >= JEV.MAX_OPTIONS)
    throw new Error("Unsupported Jev choice option count");
  return {
    type: JEV_QUESTION_TYPES.CHOICE,
    instructions,
    criteria: Object.fromEntries([
      [NO_MATCH_OPTION, noneLabel],
      ...options.map((option, index) => [String(index + 1), option]),
    ]),
  };
}

/** The item a numbered choice selected, or null for the "none" option. */
export function pickNumbered<Item>(
  answer: JevAnswer,
  items: Item[],
): Item | null {
  const index = Number(chosen(answer)) - 1;
  return index >= 0 ? items[index] : null;
}

export function isYes(answer: JevAnswer): boolean {
  if (answer.type !== JEV_QUESTION_TYPES.NOUL)
    throw new Error("Expected a Jev yes/no answer");
  return answer.noul >= NOUL_YES;
}

export function chosen(answer: JevAnswer): string {
  if (answer.type !== JEV_QUESTION_TYPES.CHOICE)
    throw new Error("Expected a Jev choice answer");
  return answer.choice;
}

export function scored(answer: JevAnswer): number {
  if (answer.type !== JEV_QUESTION_TYPES.SCORE)
    throw new Error("Expected a Jev score answer");
  return answer.score;
}

/** Reads answers while recording which ones shaped the output. */
export function trackAnswers(answers: Record<string, JevAnswer>) {
  const used = new Set<string>();
  return {
    read(key: string): JevAnswer {
      const answer = answers[key];
      if (!answer) throw new Error("Missing Jev answer");
      used.add(key);
      return answer;
    },
    usedKeys: () => [...used],
  };
}
