import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { STRONG_GEMINI_MODEL } from "../constants/llm-constants";
import {
  CATEGORY_RULE_SANITY_CHECK_ENABLED_ENV_VAR,
  CategoryRuleSanityService,
} from "./category-rule-sanity.service";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { LLM_OP_SANITY_CHECK_CATEGORY_RULE } from "./llm-operations";
import { RULE_SANITY_VERDICTS, RuleSanityCheckParams } from "./llm-rule-sanity";

const params: RuleSanityCheckParams = {
  categoryName: "Sentry alerts",
  categoryDescription: "Error alerts from Sentry",
  candidate: {
    senders: ["noreply@sentry.io"],
    subjectContains: ["[Sentry]"],
    bodyContains: ["New issue"],
    subjectNotContains: [],
    bodyNotContains: [],
  },
  otherCategories: [{ name: "Billing", description: "Invoices" }],
  sampleEmails: [
    {
      from: "noreply@sentry.io",
      subject: "[Sentry] New issue",
      body: "TypeError",
    },
  ],
  userId: "user-1",
};

const acceptJson = JSON.stringify({
  verdict: "accept",
  confidence: 0.9,
  reason: "single-purpose sender with a distinctive marker",
  betterCategoryName: null,
  suggestedRevision: null,
});

describe("CategoryRuleSanityService", () => {
  let service: CategoryRuleSanityService;
  let generateText: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(async () => {
    generateText = jest.fn();
    configGet = jest.fn().mockReturnValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRuleSanityService,
        { provide: LLMCoreService, useValue: { generateText } },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();
    service = module.get(CategoryRuleSanityService);
  });

  it("is enabled by default and disabled only by an explicit 'false'", () => {
    expect(service.isEnabled).toBe(true);
    configGet.mockImplementation((key: string) =>
      key === CATEGORY_RULE_SANITY_CHECK_ENABLED_ENV_VAR ? "false" : undefined,
    );
    expect(service.isEnabled).toBe(false);
  });

  it("returns null without calling the LLM when disabled", async () => {
    configGet.mockImplementation((key: string) =>
      key === CATEGORY_RULE_SANITY_CHECK_ENABLED_ENV_VAR ? "false" : undefined,
    );
    await expect(service.checkRule(params)).resolves.toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("calls the strong Gemini model with thinking and structured output", async () => {
    generateText.mockResolvedValue(acceptJson);

    const result = await service.checkRule(params);

    expect(result?.verdict).toBe(RULE_SANITY_VERDICTS.ACCEPT);
    expect(generateText).toHaveBeenCalledTimes(1);
    const [request, provider, userId] = generateText.mock.calls[0];
    expect(provider).toBe(LLMProvider.GEMINI);
    expect(userId).toBe("user-1");
    expect(request).toEqual(
      expect.objectContaining({
        model: STRONG_GEMINI_MODEL,
        thinking: true,
        jsonMode: true,
        temperature: 0,
        operation: LLM_OP_SANITY_CHECK_CATEGORY_RULE,
      }),
    );
    expect(request.responseSchema).toBeDefined();
    expect(request.prompt).toContain("Sentry alerts");
    expect(request.prompt).toContain("- Billing — Invoices");
    expect(request.prompt).toContain("From: noreply@sentry.io");
  });

  it("honours the GEMINI_STRONG_MODEL override", async () => {
    configGet.mockImplementation((key: string) =>
      key === "GEMINI_STRONG_MODEL" ? "gemini-override" : undefined,
    );
    generateText.mockResolvedValue(acceptJson);

    await service.checkRule(params);

    expect(service.model).toBe("gemini-override");
    expect(generateText.mock.calls[0][0].model).toBe("gemini-override");
  });

  it("retries once without thinking when the thinking pass yields no verdict", async () => {
    generateText
      .mockResolvedValueOnce("I was thinking and ran out of budget")
      .mockResolvedValueOnce(acceptJson);

    const result = await service.checkRule(params);

    expect(result?.verdict).toBe(RULE_SANITY_VERDICTS.ACCEPT);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[0][0].thinking).toBe(true);
    expect(generateText.mock.calls[1][0].thinking).toBe(false);
  });

  it("returns null when both passes fail to produce a verdict", async () => {
    generateText.mockResolvedValue("nope");
    await expect(service.checkRule(params)).resolves.toBeNull();
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("returns null (never throws) when the LLM call errors", async () => {
    generateText.mockRejectedValue(new Error("quota"));
    await expect(service.checkRule(params)).resolves.toBeNull();
  });
});
