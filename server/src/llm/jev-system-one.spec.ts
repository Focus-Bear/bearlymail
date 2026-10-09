import { JEV, JEV_QUESTION_TYPES } from "../constants/jev.constants";
import { JevRequest, parseJevResponse } from "./jev-system-one";

const QUESTIONS: JevRequest["questions"] = {
  category: {
    type: JEV_QUESTION_TYPES.CHOICE,
    instructions: "Choose a category",
    criteria: { "0": "Other", "1": "Sales" },
  },
};
const VALID_ANSWER = {
  type: JEV_QUESTION_TYPES.CHOICE,
  choice: "1",
  confidence: 0.95,
  probabilities: { "0": 0.01, "1": 0.99 },
};
const makeResponse = (answer: unknown = VALID_ANSWER) => ({
  model: JEV.DEFAULT_MODEL,
  answers: { category: answer },
  usage: { input_tokens: 100, output_tokens: 10 },
});

describe("Jev response boundary", () => {
  it("preserves valid raw probabilities and usage", () => {
    const response = makeResponse();
    expect(parseJevResponse(response, QUESTIONS)).toEqual(response);
  });

  it.each([
    undefined,
    { ...VALID_ANSWER, type: JEV_QUESTION_TYPES.NOUL },
    { ...VALID_ANSWER, choice: "missing" },
    { ...VALID_ANSWER, confidence: -0.1 },
    { ...VALID_ANSWER, confidence: Number.NaN },
    { ...VALID_ANSWER, confidence: 1.1 },
    { ...VALID_ANSWER, probabilities: { "0": 0 } },
    { ...VALID_ANSWER, probabilities: { "0": 0, "1": 2 } },
    { ...VALID_ANSWER, probabilities: { "0": 0, "1": 1, extra: 0 } },
  ])("rejects malformed or out-of-domain answers (%j)", (answer) => {
    const response = makeResponse();
    response.answers.category = answer;
    expect(() => parseJevResponse(response, QUESTIONS)).toThrow();
  });

  it.each([
    { input_tokens: -1, output_tokens: 0 },
    { input_tokens: 1.5, output_tokens: 0 },
    { input_tokens: "100", output_tokens: 0 },
  ])("rejects invalid token accounting (%j)", (usage) => {
    expect(() =>
      parseJevResponse({ ...makeResponse(), usage }, QUESTIONS),
    ).toThrow("Invalid Jev token usage");
  });
});
