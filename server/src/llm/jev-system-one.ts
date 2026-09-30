import { JEV, JEV_QUESTION_TYPES } from "../constants/jev.constants";

export type JevQuestion =
  | {
      type: typeof JEV_QUESTION_TYPES.NOUL;
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | {
      type: typeof JEV_QUESTION_TYPES.CHOICE;
      instructions: string;
      criteria: Record<string, string>;
    }
  | {
      type: typeof JEV_QUESTION_TYPES.SCORE;
      instructions: string;
      criteria: string[];
    };
export type JevAnswer =
  | { type: typeof JEV_QUESTION_TYPES.NOUL; noul: number }
  | {
      type: typeof JEV_QUESTION_TYPES.CHOICE;
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | {
      type: typeof JEV_QUESTION_TYPES.SCORE;
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
    };
export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}
export interface JevRequest {
  state: unknown;
  model: string;
  questions: Record<string, JevQuestion>;
}

export function isJevRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function validateJevAnswer(answer: unknown, question: JevQuestion): void {
  if (!isJevRecord(answer) || answer.type !== question.type)
    throw new Error("Missing or invalid Jev answer");
  if (question.type === JEV_QUESTION_TYPES.NOUL) {
    if (!isProbability(answer.noul))
      throw new Error("Invalid Jev yes/no probability");
    return;
  }
  const options =
    question.type === JEV_QUESTION_TYPES.CHOICE
      ? Object.keys(question.criteria)
      : question.criteria.map((_, index) => String(index));
  const { probabilities } = answer;
  if (
    !isProbability(answer.confidence) ||
    !isJevRecord(probabilities) ||
    Object.keys(probabilities).length !== options.length ||
    options.some((option) => !isProbability(probabilities[option]))
  ) {
    throw new Error("Invalid Jev probability distribution");
  }
  if (
    question.type === JEV_QUESTION_TYPES.CHOICE &&
    (typeof answer.choice !== "string" || !options.includes(answer.choice))
  ) {
    throw new Error("Invalid Jev choice");
  }
  if (
    question.type === JEV_QUESTION_TYPES.SCORE &&
    (typeof answer.score !== "number" ||
      !Number.isFinite(answer.score) ||
      answer.score < 0 ||
      answer.score > question.criteria.length - 1)
  ) {
    throw new Error("Invalid Jev score");
  }
}

export function parseJevResponse(
  value: unknown,
  questions: JevRequest["questions"],
): JevResponse {
  if (
    !isJevRecord(value) ||
    typeof value.model !== "string" ||
    !isJevRecord(value.answers) ||
    !isJevRecord(value.usage)
  ) {
    throw new Error("Invalid Jev response envelope");
  }
  for (const [key, question] of Object.entries(questions)) {
    validateJevAnswer(value.answers[key], question);
  }
  const { input_tokens, output_tokens } = value.usage;
  if (
    !Number.isInteger(input_tokens) ||
    !Number.isInteger(output_tokens) ||
    Number(input_tokens) < 0 ||
    Number(output_tokens) < 0
  ) {
    throw new Error("Invalid Jev token usage");
  }
  return value as unknown as JevResponse;
}

export async function requestJev(
  request: JevRequest,
  apiKey: string,
): Promise<JevResponse> {
  const response = await fetch(JEV.API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(JEV.REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
  const value: unknown = await response.json();
  return parseJevResponse(value, request.questions);
}
