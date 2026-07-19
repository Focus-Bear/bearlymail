import { Test, TestingModule } from "@nestjs/testing";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES } from "../llm/llm-operations";
import { EmailClassifierService } from "./email-classifier.service";
import { EmailClassification } from "./types/auto-responder.types";

const MOCK_CLASSIFICATION_BASE: EmailClassification = {
  isAutomated: false,
  isNewsletter: false,
  isColdOutreach: false,
  isReply: false,
  isOutOfOffice: false,
  isBounce: false,
  personalizationScore: 0.5,
  urgencyLevel: "medium",
  reasons: [],
};

const AUTOMATED_CLASSIFICATION: EmailClassification = {
  ...MOCK_CLASSIFICATION_BASE,
  isAutomated: true,
  reasons: ["Automated sender pattern: noreply@github.com"],
};

const NEWSLETTER_CLASSIFICATION: EmailClassification = {
  ...MOCK_CLASSIFICATION_BASE,
  isNewsletter: true,
  reasons: ["Newsletter detected via headers (List-Unsubscribe)"],
};

describe("EmailClassifierService.checkCustomExclusionRules", () => {
  let service: EmailClassifierService;
  let llmService: jest.Mocked<LLMService>;

  const SAMPLE_EMAIL = {
    from: "noreply@github.com",
    fromName: "GitHub",
    subject: "Pull request opened",
    body: "A new pull request has been opened on your repository.",
  };

  const matchedResponse = (rule: string) =>
    JSON.stringify({
      matched: true,
      matchedRule: rule,
      reason: "Matched rule",
    });

  const notMatchedResponse = () =>
    JSON.stringify({ matched: false, matchedRule: null, reason: "No match" });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailClassifierService,
        {
          provide: LLMService,
          useValue: {
            generateText: jest.fn(),
          },
        },
        {
          provide: ErrorTrackingService,
          useValue: {
            captureException: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailClassifierService>(EmailClassifierService);
    llmService = module.get(LLMService);
  });

  it("should return no match when rules array is empty", async () => {
    const result = await service.checkCustomExclusionRules(SAMPLE_EMAIL, []);
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("No custom rules defined");
    expect(llmService.generateText).not.toHaveBeenCalled();
  });

  it("should return no match when rules array is null/undefined", async () => {
    const result = await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      null as unknown as string[],
    );
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("No custom rules defined");
  });

  it("should match 'automated emails' rule deterministically when classification.isAutomated is true (no LLM call)", async () => {
    // With our deterministic pre-check: if isAutomated=true AND rule matches /automat/i,
    // we return matched:true immediately without calling the LLM.
    const result = await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["automated emails"],
      AUTOMATED_CLASSIFICATION,
    );

    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe("automated emails");
    expect(result.reason).toContain("automated");
    // LLM should NOT be called — deterministic pre-check handles it
    expect(llmService.generateText).not.toHaveBeenCalled();
  });

  it("should match 'newsletters' rule when classification.isNewsletter is true", async () => {
    llmService.generateText.mockResolvedValue(matchedResponse("newsletters"));

    const result = await service.checkCustomExclusionRules(
      { ...SAMPLE_EMAIL, from: "newsletter@example.com" },
      ["newsletters"],
      NEWSLETTER_CLASSIFICATION,
    );

    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe("newsletters");
    const callArgs = llmService.generateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Newsletter: true");
  });

  it("should NOT match 'automated emails' rule when classification.isAutomated is false", async () => {
    llmService.generateText.mockResolvedValue(notMatchedResponse());

    const result = await service.checkCustomExclusionRules(
      { ...SAMPLE_EMAIL, from: "human@example.com" },
      ["automated emails"],
      { ...MOCK_CLASSIFICATION_BASE, isAutomated: false },
    );

    expect(result.matched).toBe(false);
  });

  it("should include relevant headers in prompt when provided", async () => {
    llmService.generateText.mockResolvedValue(
      matchedResponse("mailing list emails"),
    );

    const headers = {
      "List-Unsubscribe": "<mailto:unsubscribe@example.com>",
      "List-Id": "<updates.example.com>",
      Precedence: "bulk",
    };

    const result = await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["mailing list emails"],
      NEWSLETTER_CLASSIFICATION,
      headers,
    );

    expect(result.matched).toBe(true);
    const callArgs = llmService.generateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("list-unsubscribe");
    expect(callArgs.prompt).toContain("list-id");
    expect(callArgs.prompt).toContain("precedence");
  });

  it("should work without optional classification and headers (backward compat)", async () => {
    llmService.generateText.mockResolvedValue(matchedResponse("cold outreach"));

    const result = await service.checkCustomExclusionRules(SAMPLE_EMAIL, [
      "cold outreach",
    ]);

    expect(result.matched).toBe(true);
    expect(llmService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.any(String),
      }),
      LLMProvider.OPENAI,
      undefined,
      LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES,
    );
  });

  it("should not include classification block in prompt when classification is not provided", async () => {
    llmService.generateText.mockResolvedValue(notMatchedResponse());

    await service.checkCustomExclusionRules(SAMPLE_EMAIL, ["test rule"]);

    const callArgs = llmService.generateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain("PRIOR CLASSIFICATION");
  });

  it("should not include headers block in prompt when headers are not provided", async () => {
    llmService.generateText.mockResolvedValue(notMatchedResponse());

    await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["test rule"],
      AUTOMATED_CLASSIFICATION,
    );

    const callArgs = llmService.generateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain("EMAIL HEADERS");
  });

  it("should handle LLM response parse failure gracefully", async () => {
    llmService.generateText.mockResolvedValue("not valid json at all");

    const result = await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["test rule"],
      AUTOMATED_CLASSIFICATION,
    );

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("Failed to parse LLM response");
  });

  it("should handle LLM error gracefully", async () => {
    llmService.generateText.mockRejectedValue(new Error("LLM error"));

    const result = await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["test rule"],
      AUTOMATED_CLASSIFICATION,
    );

    expect(result.matched).toBe(false);
    expect(result.reason).toContain("Error");
  });

  it("should only include relevant headers and skip irrelevant ones", async () => {
    llmService.generateText.mockResolvedValue(notMatchedResponse());

    const headers = {
      "List-Unsubscribe": "<mailto:unsub@example.com>",
      "X-Custom-Header": "should-not-appear",
      Received: "from mail.example.com",
      "DKIM-Signature": "v=1; a=rsa-sha256",
    };

    await service.checkCustomExclusionRules(
      SAMPLE_EMAIL,
      ["test rule"],
      AUTOMATED_CLASSIFICATION,
      headers,
    );

    const callArgs = llmService.generateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("list-unsubscribe");
    expect(callArgs.prompt).not.toContain("x-custom-header");
    expect(callArgs.prompt).not.toContain("received");
    expect(callArgs.prompt).not.toContain("dkim-signature");
  });
});
