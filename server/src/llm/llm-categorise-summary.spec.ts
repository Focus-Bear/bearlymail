import { Logger } from "@nestjs/common";

import { categoriseFromSummary } from "./llm-categorise-summary";
import { getPrompt } from "./prompts";

// Isolate from filesystem/prompt loading
jest.mock("./prompts", () => ({
  getPrompt: jest.fn().mockReturnValue({
    prompt:
      "PROMPT Subject: {{subject}}, Sender: {{senderName}}, Summary: {{summary}}, Categories: {{categories}}",
    systemPrompt: "SYSTEM_PROMPT",
  }),
  renderPrompt: (template: string, vars: Record<string, string>) => {
    let res = template;
    for (const [key, val] of Object.entries(vars)) {
      res = res.replace(`{{${key}}}`, val);
    }
    return res;
  },
  UTILITY_PROMPT_IDS: {
    CATEGORISE_SUMMARY: "categorise_summary",
  },
}));

describe("categoriseFromSummary", () => {
  let generateText: jest.Mock;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    generateText = jest.fn();
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  const categories = [
    { name: "QA failed", description: "Issues that failed QA" },
    { name: "QA passed", description: "Issues that passed QA" },
  ];

  it("returns null if summary is empty or categories are empty", async () => {
    const result1 = await categoriseFromSummary(generateText, logger, {
      subject: "Test",
      summary: "",
      categories,
    });
    expect(result1).toBeNull();

    const result2 = await categoriseFromSummary(generateText, logger, {
      subject: "Test",
      summary: "This is a summary",
      categories: [],
    });
    expect(result2).toBeNull();
  });

  it("returns null if prompt configuration cannot be found", async () => {
    jest.mocked(getPrompt).mockReturnValueOnce(null);

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "Test",
      summary: "This is a summary",
      categories,
    });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("categorise_summary prompt not found"),
    );
  });

  it("calls generateText with rendered prompt and parses a valid JSON response", async () => {
    generateText.mockResolvedValue(
      JSON.stringify({
        result: {
          categoryNumber: 2,
          categoryConfidence: "HIGH",
          reasoning: "The issue has been verified.",
        },
      }),
    );

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "App Crash",
      senderName: "Bao Ngoc",
      summary: "The app crash has been QA verified and closed.",
      categories,
      userId: "user-123",
    });

    expect(generateText).toHaveBeenCalledWith({
      prompt:
        "PROMPT Subject: App Crash, Sender: Bao Ngoc, Summary: The app crash has been QA verified and closed., Categories: 1. QA failed — Issues that failed QA\n2. QA passed — Issues that passed QA",
      systemPrompt: "SYSTEM_PROMPT",
      temperature: 0.3,
      maxTokens: 2000,
      jsonMode: true,
      userId: "user-123",
    });

    expect(result).toEqual({
      categoryNumber: 2,
      categoryName: "QA passed",
      categoryConfidence: "HIGH",
      reasoning: "The issue has been verified.",
    });
  });

  it("handles markdown codeblock wrapping in LLM response", async () => {
    generateText.mockResolvedValue(
      `\`\`\`json\n${JSON.stringify({
        categoryNumber: 1,
        categoryConfidence: "medium",
        reasoning: "QA failed reported.",
      })}\n\`\`\``,
    );

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "App Crash",
      summary: "QA failure was reported.",
      categories,
    });

    expect(result).toEqual({
      categoryNumber: 1,
      categoryName: "QA failed",
      categoryConfidence: "MEDIUM",
      reasoning: "QA failed reported.",
    });
  });

  it("resolves to Other when categoryNumber is 0", async () => {
    generateText.mockResolvedValue(
      JSON.stringify({
        categoryNumber: 0,
        categoryConfidence: "LOW",
        reasoning: "Unrelated to QA.",
      }),
    );

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "Lunch",
      summary: "Team lunch invitation.",
      categories,
    });

    expect(result).toEqual({
      categoryNumber: 0,
      categoryName: "Other",
      categoryConfidence: "LOW",
      reasoning: "Unrelated to QA.",
    });
  });

  it("returns null and logs warning if response does not contain a JSON object", async () => {
    generateText.mockResolvedValue("This is not JSON");

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "Test",
      summary: "This is a summary",
      categories,
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("No JSON object in response"),
    );
  });

  it("returns null and logs error if generateText throws an exception", async () => {
    generateText.mockRejectedValue(new Error("LLM failure"));

    const result = await categoriseFromSummary(generateText, logger, {
      subject: "Test",
      summary: "This is a summary",
      categories,
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("LLM failure"),
    );
  });
});
