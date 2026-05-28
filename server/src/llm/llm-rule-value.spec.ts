import { Logger } from "@nestjs/common";

import {
  assessRuleAddsValue,
  type AssessRuleValueParams,
  type RuleSpecSummary,
} from "./llm-rule-value";

// Isolate the parser from prompt loading/rendering.
jest.mock("./prompts", () => ({
  getPrompt: () => ({ prompt: "PROMPT {{categoryName}}", systemPrompt: "" }),
  renderPrompt: (template: string) => template,
  UTILITY_PROMPT_IDS: {
    ASSESS_CATEGORY_RULE_VALUE: "assess_category_rule_value",
  },
}));

const logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const candidate: RuleSpecSummary = {
  senders: ["*@github.com"],
  subjectContains: ["PR #"],
  bodyContains: ["pull request"],
  subjectNotContains: [],
  bodyNotContains: [],
};

const params: AssessRuleValueParams = {
  categoryName: "GitHub PRs",
  candidate,
  // Non-empty so the LLM path runs (an empty list short-circuits to fail-open).
  existingRules: [{ ...candidate, subjectContains: ["Issue #"] }],
  maxSubjectNotPhrases: 10,
  maxBodyNotPhrases: 20,
};

const generateTextReturning = (json: string) =>
  jest.fn().mockResolvedValue(json) as never;

describe("assessRuleAddsValue boolean parsing", () => {
  afterEach(() => jest.clearAllMocks());

  it("treats a real boolean false makesSense as false", async () => {
    const result = await assessRuleAddsValue(
      generateTextReturning(
        '{"makesSense":false,"addsValue":true,"reasoning":"x","subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      ),
      logger,
      params,
    );
    expect(result.makesSense).toBe(false);
  });

  it('treats a stringified "false" makesSense as false (LLM quirk)', async () => {
    const result = await assessRuleAddsValue(
      generateTextReturning(
        '{"makesSense":"false","addsValue":true,"reasoning":"x","subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      ),
      logger,
      params,
    );
    expect(result.makesSense).toBe(false);
  });

  it('treats a stringified "False" addsValue as false (case-insensitive)', async () => {
    const result = await assessRuleAddsValue(
      generateTextReturning(
        '{"makesSense":true,"addsValue":"False","reasoning":"x","subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      ),
      logger,
      params,
    );
    expect(result.addsValue).toBe(false);
  });

  it("fails open (true) when a verdict field is missing", async () => {
    const result = await assessRuleAddsValue(
      generateTextReturning(
        '{"addsValue":true,"reasoning":"x","subjectNotContainsAny":[],"bodyNotContainsAny":[]}',
      ),
      logger,
      params,
    );
    expect(result.makesSense).toBe(true);
  });
});
