/**
 * Unit tests for the two-stage phishing verdict flow:
 * the cheap primary model (Nova Micro in prod) over-flags, so banner-worthy
 * verdicts (medium/high) must be confirmed on Gemini before they stand.
 */
import { Test, TestingModule } from "@nestjs/testing";

import { PhishingSignals } from "../summarization/phishing-detection.service";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { LLMSummarizationService } from "./llm-summarization.service";

const SIGNALS: PhishingSignals = {
  hasDomainMismatch: true,
  senderDomain: "evil.xyz",
  linkedDomains: ["evil.xyz"],
  suspiciousKeywords: ["urgency language"],
  rawScore: 4,
};

const MEDIUM_VERDICT = {
  is_phishing: true,
  confidence: "medium" as const,
  reason: "Urgency plus mismatched domain",
};

describe("LLMSummarizationService.confirmPhishingVerdict", () => {
  let service: LLMSummarizationService;
  let mockCore: jest.Mocked<
    Pick<
      LLMCoreService,
      "generateText" | "getAvailableProviders" | "getDefaultProvider"
    >
  >;

  beforeEach(async () => {
    mockCore = {
      generateText: jest.fn(),
      getAvailableProviders: jest.fn().mockReturnValue([LLMProvider.GEMINI]),
      getDefaultProvider: jest.fn().mockReturnValue(LLMProvider.BEDROCK),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMSummarizationService,
        { provide: LLMCoreService, useValue: mockCore },
      ],
    }).compile();
    service = module.get(LLMSummarizationService);
  });

  it("passes through null, non-phishing, and low-confidence verdicts without an LLM call", async () => {
    expect(
      await service.confirmPhishingVerdict({
        verdict: null,
        emailBody: "body",
        emailSubject: "subject",
        phishingSignals: SIGNALS,
        primaryProvider: undefined,
      }),
    ).toBeNull();
    const notPhishing = { ...MEDIUM_VERDICT, is_phishing: false };
    expect(
      await service.confirmPhishingVerdict({
        verdict: notPhishing,
        emailBody: "body",
        emailSubject: "subject",
        phishingSignals: SIGNALS,
        primaryProvider: undefined,
      }),
    ).toEqual(notPhishing);
    const low = { ...MEDIUM_VERDICT, confidence: "low" as const };
    expect(
      await service.confirmPhishingVerdict({
        verdict: low,
        emailBody: "body",
        emailSubject: "subject",
        phishingSignals: SIGNALS,
        primaryProvider: undefined,
      }),
    ).toEqual(low);
    expect(mockCore.generateText).not.toHaveBeenCalled();
  });

  it("clears a medium verdict when Gemini judges the email legitimate", async () => {
    mockCore.generateText.mockResolvedValueOnce(
      JSON.stringify({ phishing: null }),
    );
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.BEDROCK,
    });
    expect(result).toBeNull();
    expect(mockCore.generateText).toHaveBeenCalledTimes(1);
    const [, providerArg] = mockCore.generateText.mock.calls[0];
    expect(providerArg).toBe(LLMProvider.GEMINI);
  });

  it("keeps a verdict Gemini confirms, using Gemini's confidence and reason", async () => {
    mockCore.generateText.mockResolvedValueOnce(
      JSON.stringify({
        phishing: {
          is_phishing: true,
          confidence: "high",
          reason: "Lookalike domain",
        },
      }),
    );
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.BEDROCK,
    });
    expect(result).toEqual({
      is_phishing: true,
      confidence: "high",
      reason: "Lookalike domain",
    });
  });

  it("keeps the primary verdict when the confirmation call fails (fail-open)", async () => {
    mockCore.generateText.mockRejectedValueOnce(new Error("rate limited"));
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.BEDROCK,
    });
    expect(result).toEqual(MEDIUM_VERDICT);
  });

  it("keeps the primary verdict when the confirmation response is unparseable", async () => {
    mockCore.generateText.mockResolvedValueOnce("not json at all");
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.BEDROCK,
    });
    expect(result).toEqual(MEDIUM_VERDICT);
  });

  it("skips confirmation when Gemini is not configured", async () => {
    mockCore.getAvailableProviders.mockReturnValue([LLMProvider.OPENAI]);
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.BEDROCK,
    });
    expect(result).toEqual(MEDIUM_VERDICT);
    expect(mockCore.generateText).not.toHaveBeenCalled();
  });

  it("skips confirmation when the primary check already ran on Gemini", async () => {
    const result = await service.confirmPhishingVerdict({
      verdict: MEDIUM_VERDICT,
      emailBody: "body",
      emailSubject: "subject",
      phishingSignals: SIGNALS,
      primaryProvider: LLMProvider.GEMINI,
    });
    expect(result).toEqual(MEDIUM_VERDICT);
    expect(mockCore.generateText).not.toHaveBeenCalled();
  });
});
