import { Logger } from "@nestjs/common";

import { LLMProvider } from "./llm.types";
import {
  deriveExclusionPhrasesFromFalsePositives,
  suggestRulesFromEmailSamples,
} from "./llm-rule-suggestion";

// Isolate the routing logic from prompt loading/rendering.
jest.mock("./prompts", () => ({
  getPrompt: () => ({ prompt: "PROMPT {{categoryName}}", systemPrompt: "" }),
  renderPrompt: (template: string) => template,
  UTILITY_PROMPT_IDS: {
    SUGGEST_CATEGORY_RULES: "suggest_category_rules",
    DERIVE_RULE_EXCLUSIONS: "derive_rule_exclusions",
  },
}));

const logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const USABLE_SUGGESTION =
  '{"fromMatchesAny":["*@github.com"],"subjectContainsAny":["QA Passed"],"bodyContainsAny":[],"subjectNotContainsAny":[],"bodyNotContainsAny":[]}';
const EMPTY_SUGGESTION =
  '{"fromMatchesAny":[],"subjectContainsAny":[],"bodyContainsAny":[],"subjectNotContainsAny":[],"bodyNotContainsAny":[]}';

const suggestParams = {
  categoryName: "GitHub QA passed issues",
  senderEmails: ["notifications@github.com"],
  emailSamples: [{ subject: "Issue #1 — QA Passed", body: "QA Passed." }],
  userId: "user-1",
};

const providersCalled = (generateText: jest.Mock): LLMProvider[] =>
  generateText.mock.calls.map(([, provider]) => provider as LLMProvider);

describe("suggestRulesFromEmailSamples", () => {
  afterEach(() => jest.clearAllMocks());

  it("runs on Gemini only (Nova is not accurate enough for this prompt)", async () => {
    const generateText = jest.fn().mockResolvedValue(USABLE_SUGGESTION);

    const result = await suggestRulesFromEmailSamples(
      generateText,
      logger,
      suggestParams,
    );

    expect(result?.subjectContainsAny).toEqual(["QA Passed"]);
    expect(providersCalled(generateText)).toEqual([LLMProvider.GEMINI]);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ jsonMode: true, userId: "user-1" }),
      LLMProvider.GEMINI,
    );
  });

  it("returns null without retrying when the response has no usable phrases", async () => {
    const generateText = jest.fn().mockResolvedValue(EMPTY_SUGGESTION);

    const result = await suggestRulesFromEmailSamples(
      generateText,
      logger,
      suggestParams,
    );

    expect(result).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("returns null when the response has no JSON", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue("Sorry, I cannot help with that.");

    const result = await suggestRulesFromEmailSamples(
      generateText,
      logger,
      suggestParams,
    );

    expect(result).toBeNull();
  });

  it("returns null when the LLM call throws", async () => {
    const generateText = jest.fn().mockRejectedValue(new Error("down"));

    const result = await suggestRulesFromEmailSamples(
      generateText,
      logger,
      suggestParams,
    );

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("down"));
  });
});

describe("deriveExclusionPhrasesFromFalsePositives", () => {
  afterEach(() => jest.clearAllMocks());

  const deriveParams = {
    categoryName: "GitHub PRs",
    truePositives: [{ subject: "PR #12 opened", body: "pull request" }],
    falsePositives: [{ subject: "Issue #7 opened", body: "opened an issue" }],
    maxSubjectNotPhrases: 3,
    maxBodyNotPhrases: 3,
  };

  it("uses the Nova exclusions when it finds a separator", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue(
        '{"subjectNotContainsAny":["Issue #"],"bodyNotContainsAny":["opened an issue"]}',
      );

    const result = await deriveExclusionPhrasesFromFalsePositives(
      generateText,
      logger,
      deriveParams,
    );

    expect(result).toEqual({
      subjectNotContainsAny: ["Issue #"],
      bodyNotContainsAny: ["opened an issue"],
    });
    expect(providersCalled(generateText)).toEqual([LLMProvider.BEDROCK]);
  });

  it("re-checks an empty Nova answer on Gemini before trusting it", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValueOnce(
        '{"subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      )
      .mockResolvedValueOnce(
        '{"subjectNotContainsAny":["Issue #"],"bodyNotContainsAny":[]}',
      );

    const result = await deriveExclusionPhrasesFromFalsePositives(
      generateText,
      logger,
      deriveParams,
    );

    expect(result.subjectNotContainsAny).toEqual(["Issue #"]);
    expect(providersCalled(generateText)).toEqual([
      LLMProvider.BEDROCK,
      LLMProvider.GEMINI,
    ]);
  });

  it("returns empty arrays when both providers find nothing", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue(
        '{"subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      );

    const result = await deriveExclusionPhrasesFromFalsePositives(
      generateText,
      logger,
      deriveParams,
    );

    expect(result).toEqual({
      subjectNotContainsAny: [],
      bodyNotContainsAny: [],
    });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("skips the LLM entirely when there are no false positives", async () => {
    const generateText = jest.fn();

    const result = await deriveExclusionPhrasesFromFalsePositives(
      generateText,
      logger,
      { ...deriveParams, falsePositives: [] },
    );

    expect(result).toEqual({
      subjectNotContainsAny: [],
      bodyNotContainsAny: [],
    });
    expect(generateText).not.toHaveBeenCalled();
  });
});
