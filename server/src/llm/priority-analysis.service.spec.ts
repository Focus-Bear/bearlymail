import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { QUERY_LIMITS } from "../constants/query-limits";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { LLMCoreService } from "./llm-core.service";
import { PriorityAnalysisService } from "./priority-analysis.service";
import * as prompts from "./prompts";

jest.mock("./prompts", () => ({
  getPrompt: jest.fn(),
  renderPrompt: jest.fn(),
  loadPrompts: jest.fn(),
  PRIORITY_PROMPT_IDS: {
    ANALYZE_PRIORITY: "analyze_priority",
    ANALYZE_PRIORITY_FEEDBACK: "analyze_priority_feedback",
    INCREMENTAL_PRIORITY_CHECK: "incremental_priority_check",
  },
}));

const mockEmail = {
  from: "sender@example.com",
  fromName: "Sender Name",
  subject: "Test Email",
  body: "This is a test email body.",
};

const validPriorityResponse = JSON.stringify({
  result: {
    urgencyScore: 50,
    urgencyExplanation: "Moderate urgency",
    sentimentScore: 0,
    goalAlignmentScore: 40,
    goalAlignmentExplanation: "Somewhat aligned",
    category: "Customer Support",
    categoryExplanation: "Support request",
    reasoning: "Standard support email",
  },
});

describe("PriorityAnalysisService", () => {
  let service: PriorityAnalysisService;
  let mockLLMCoreService: jest.Mocked<Partial<LLMCoreService>>;
  let mockErrorTrackingService: jest.Mocked<Partial<ErrorTrackingService>>;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockLLMCoreService = {
      generateText: jest.fn(),
    };

    mockErrorTrackingService = {
      captureException: jest.fn(),
    };

    (prompts.getPrompt as jest.Mock).mockReturnValue({
      id: "analyze_priority",
      prompt: "Analyze this email: {{subject}}",
      systemPrompt: "You are an email analyzer.",
    });
    (prompts.renderPrompt as jest.Mock).mockReturnValue(
      "Analyze this email: Test Email",
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriorityAnalysisService,
        { provide: LLMCoreService, useValue: mockLLMCoreService },
        { provide: ErrorTrackingService, useValue: mockErrorTrackingService },
      ],
    }).compile();

    service = module.get<PriorityAnalysisService>(PriorityAnalysisService);

    // Spy on logger to verify error messages
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("analyzePriority", () => {
    it("should parse a valid JSON response with top-level result key correctly", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validPriorityResponse,
      );

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.category).toBe("Customer Support");
      expect(result.categoryExplanation).toBe("Support request");
      expect(result.urgencyScore).toBe(50);
      // sentimentScore is not derived from LLM output — it comes from preComputedSentimentScore.
      // When no pre-computed value is passed, the result is undefined so the caller
      // does not clobber the DB value that was set during the summary step.
      expect(result.sentimentScore).toBeUndefined();
    });

    it("should use preComputedSentimentScore when provided, ignoring LLM sentiment", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validPriorityResponse,
      );

      const result = await service.analyzePriority({
        email: mockEmail,
        preComputedSentimentScore: 0.8,
      });

      expect(result.sentimentScore).toBe(0.8);
    });

    it("should parse legacy flat JSON response for backward compatibility", async () => {
      const legacyResponse = JSON.stringify({
        urgencyScore: 75,
        urgencyExplanation: "High urgency",
        sentimentScore: -0.5,
        goalAlignmentScore: 60,
        goalAlignmentExplanation: "Aligned",
        category: "Sales",
        categoryExplanation: "Sales email",
        reasoning: "Sales inquiry",
      });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        legacyResponse,
      );

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.category).toBe("Sales");
      expect(result.urgencyScore).toBe(75);
    });

    it("should pass jsonMode: true to LLM to enforce JSON responses", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validPriorityResponse,
      );

      await service.analyzePriority({ email: mockEmail });

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({ jsonMode: true }),
        undefined,
        undefined,
      );
    });

    it("should use LLM_MAX_TOKENS_MEDIUM to prevent JSON truncation", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validPriorityResponse,
      );

      await service.analyzePriority({ email: mockEmail });

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        }),
        undefined,
        undefined,
      );
    });

    it("should log a clear error and use fallback when LLM returns non-JSON response", async () => {
      const nonJsonResponse = "I cannot analyze this email right now.";
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        nonJsonResponse,
      );

      const result = await service.analyzePriority({
        email: mockEmail,
        userId: "user-123",
      });

      // Should log a clear error (not warn) so it's visible in worker terminal
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "analyzePriority: LLM returned a non-JSON response",
        ),
        // no second error arg for this case
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test Email"),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(nonJsonResponse.substring(0, 100)),
      );

      // Error tracking should be notified
      expect(mockErrorTrackingService.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        "user-123",
        expect.objectContaining({ operation: "analyze_priority" }),
      );

      // Fallback values should be returned
      expect(result.category).toBe("Other");
      expect(result.categoryExplanation).toBe(
        "Unable to categorize - fallback response",
      );
    });

    it("should log a clear error and use fallback when LLM returns malformed JSON", async () => {
      const malformedJson = "{ urgencyScore: 50, category: BROKEN_JSON }";
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        malformedJson,
      );

      const result = await service.analyzePriority({
        email: mockEmail,
        userId: "user-456",
      });

      // Should log a clear error (not warn) with response preview
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "analyzePriority: Failed to parse LLM priority response as JSON",
        ),
        expect.any(Error),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test Email"),
        expect.any(Error),
      );

      // Error tracking should be notified
      expect(mockErrorTrackingService.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        "user-456",
        expect.objectContaining({ operation: "analyze_priority" }),
      );

      // Fallback values should be returned
      expect(result.category).toBe("Other");
      expect(result.categoryExplanation).toBe(
        "Unable to categorize - fallback response",
      );
    });

    it("should use urgency keyword heuristic in fallback when urgent keywords present", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        "This is URGENT please respond ASAP",
      );

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.urgencyExplanation).toBe("Contains urgent keywords");
      expect(result.urgencyScore).toBeGreaterThan(0);
    });

    it("should throw StructuralError when prompt template is not found", async () => {
      (prompts.getPrompt as jest.Mock).mockReturnValue(null);

      await expect(
        service.analyzePriority({ email: mockEmail }),
      ).rejects.toThrow("Prompt template not found: analyze_priority");
    });

    it("should handle category 'Other' with protoCategorySuggestion", async () => {
      const responseWithProtoCategory = JSON.stringify({
        result: {
          urgencyScore: 20,
          urgencyExplanation: "Low urgency",
          sentimentScore: 0,
          goalAlignmentScore: 10,
          goalAlignmentExplanation: "Not aligned",
          category: "Other",
          categoryExplanation: "Does not fit existing categories",
          reasoning: "Miscellaneous email",
          protoCategorySuggestion: {
            name: "📦 Shipping Updates",
            description: "Emails about package delivery status",
          },
        },
      });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        responseWithProtoCategory,
      );

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.category).toBe("Other");
      expect(result.protoCategorySuggestion).toEqual({
        name: "📦 Shipping Updates",
        description: "Emails about package delivery status",
      });
    });
  });

  describe("analyzePriorityBatch", () => {
    const batchEmails = [
      {
        emailKey: "email-1",
        from: "sender1@example.com",
        subject: "First email",
        body: "Body 1",
      },
      {
        emailKey: "email-2",
        from: "sender2@example.com",
        subject: "Second email",
        body: "Body 2",
      },
    ];

    const emailResultItems = [
      {
        key: "email-1",
        urgencyScore: 30,
        urgencyExplanation: "Low urgency",
        sentimentScore: 0,
        goalAlignmentScore: 20,
        goalAlignmentExplanation: "Slightly aligned",
        category: "Newsletters",
        categoryExplanation: "Newsletter content",
        reasoning: "Mass email",
      },
      {
        key: "email-2",
        urgencyScore: 70,
        urgencyExplanation: "High urgency",
        sentimentScore: -0.5,
        goalAlignmentScore: 80,
        goalAlignmentExplanation: "Highly aligned",
        category: "Customer Support",
        categoryExplanation: "Support request",
        reasoning: "Customer issue",
      },
    ];

    // Correct format: wrapped with priority_results key
    const validBatchResponse = JSON.stringify({
      priority_results: emailResultItems,
    });

    it("should parse a valid batch JSON response with priority_results wrapper key", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validBatchResponse,
      );

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(results.size).toBe(2);
      expect(results.get("email-1")?.category).toBe("Newsletters");
      expect(results.get("email-2")?.category).toBe("Customer Support");
      expect(results.get("email-2")?.urgencyScore).toBe(70);
    });

    it("should pass jsonMode: true to LLM to enforce JSON array responses", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validBatchResponse,
      );

      await service.analyzePriorityBatch(batchEmails);

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({ jsonMode: true }),
        undefined,
        undefined,
      );
    });

    it("should log a clear error when LLM returns non-JSON response for batch", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        "Sorry, I cannot process these emails.",
      );

      const results = await service.analyzePriorityBatch(
        batchEmails,
        undefined,
        undefined,
        "user-789",
      );

      // Should log a clear error with email count and keys
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "analyzePriorityBatch: LLM returned a non-JSON response",
        ),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("2 emails"),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("email-1"),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("email-2"),
      );

      // Error tracking should be notified
      expect(mockErrorTrackingService.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        "user-789",
        expect.objectContaining({
          operation: "analyze_priority_batch",
          emailCount: 2,
        }),
      );

      // All emails should get fallback values
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.category).toBe("Other");
      expect(results.get("email-1")?.categoryExplanation).toBe(
        "Batch analysis failed",
      );
    });

    it("should log missing email keys when batch response omits some emails", async () => {
      // Only returns result for email-1, not email-2 (using correct priority_results format)
      const partialResponse = JSON.stringify({
        priority_results: [
          {
            key: "email-1",
            urgencyScore: 30,
            urgencyExplanation: "Low urgency",
            sentimentScore: 0,
            goalAlignmentScore: 20,
            goalAlignmentExplanation: "Slightly aligned",
            category: "Newsletters",
            categoryExplanation: "Newsletter content",
            reasoning: "Mass email",
          },
        ],
      });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        partialResponse,
      );

      const results = await service.analyzePriorityBatch(batchEmails);

      // Should log an error about missing emails
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "1 of 2 emails were missing from LLM batch response",
        ),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("email-2"),
      );

      // email-1 should have correct values, email-2 should have fallback
      expect(results.get("email-1")?.category).toBe("Newsletters");
      expect(results.get("email-2")?.category).toBe("Other");
      expect(results.get("email-2")?.categoryExplanation).toBe(
        "Batch analysis failed",
      );
    });

    it("should use fallback when LLM responds with a wrong wrapper key (non-deterministic key name)", async () => {
      // LLM invented its own key name instead of using priority_results — this is a prompt compliance failure
      const wrongKeyResponse = JSON.stringify({ results: emailResultItems });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        wrongKeyResponse,
      );

      const loggerWarnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      const results = await service.analyzePriorityBatch(batchEmails);

      // Should warn about the unexpected shape
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Unexpected response shape from LLM. Expected { priority_results: [...] }.",
        ),
        expect.objectContaining({ parsed: expect.any(String) }),
      );

      // Both emails should receive fallback sentinel values (prompt compliance failure)
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(true);
      expect(results.get("email-2")?.isFallback).toBe(true);
      expect(results.get("email-1")?.category).toBe("Other");
      expect(results.get("email-2")?.category).toBe("Other");
    });

    it("should return empty map for empty email list", async () => {
      const results = await service.analyzePriorityBatch([]);

      expect(results.size).toBe(0);
      expect(mockLLMCoreService.generateText).not.toHaveBeenCalled();
    });

    // Regression test for issue #980:
    // LLM returns { "priority_results": [...] } but the parser previously expected a bare array.
    it("regression #980: correctly parses { priority_results: [...] } response shape", async () => {
      const wrappedResponse = JSON.stringify({
        priority_results: [
          {
            key: "email-1",
            urgencyScore: 55,
            urgencyExplanation: "Needs timely reply",
            goalAlignmentScore: 65,
            goalAlignmentExplanation: "Aligned with support goals",
            category: "Customer Support",
            categoryExplanation: "Customer reporting an issue",
            reasoning: "Support ticket requiring response",
          },
          {
            key: "email-2",
            urgencyScore: 5,
            urgencyExplanation: "Informational digest",
            goalAlignmentScore: 10,
            goalAlignmentExplanation: "Not directly related to goals",
            category: "Newsletters",
            categoryExplanation: "Mass-sent newsletter",
            reasoning: "Weekly newsletter, no action required",
          },
        ],
      });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        wrappedResponse,
      );

      const results = await service.analyzePriorityBatch(batchEmails);

      // Both emails should be parsed — not silently dropped
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-1")?.category).toBe("Customer Support");
      expect(results.get("email-1")?.urgencyScore).toBe(55);
      expect(results.get("email-2")?.isFallback).toBe(false);
      expect(results.get("email-2")?.category).toBe("Newsletters");
      expect(results.get("email-2")?.urgencyScore).toBe(5);
    });

    it("returns fallback when LLM returns unexpected shape (bare array)", async () => {
      // A bare array is no longer an accepted response shape — it is a prompt compliance failure
      const bareArray = JSON.stringify([
        {
          key: "email-1",
          urgencyScore: 30,
          urgencyExplanation: "Low urgency",
          goalAlignmentScore: 20,
          goalAlignmentExplanation: "Slightly aligned",
          category: "Newsletters",
          categoryExplanation: "Newsletter content",
          reasoning: "Mass email",
        },
        {
          key: "email-2",
          urgencyScore: 70,
          urgencyExplanation: "High urgency",
          goalAlignmentScore: 80,
          goalAlignmentExplanation: "Highly aligned",
          category: "Customer Support",
          categoryExplanation: "Support request",
          reasoning: "Customer issue",
        },
      ]);
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        bareArray,
      );

      const loggerWarnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      const results = await service.analyzePriorityBatch(batchEmails);

      // Should warn about the unexpected shape
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Unexpected response shape from LLM. Expected { priority_results: [...] }.",
        ),
        expect.objectContaining({ parsed: expect.any(String) }),
      );

      // Both emails must receive isFallback: true — bare array is not accepted
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(true);
      expect(results.get("email-2")?.isFallback).toBe(true);
    });

    it("should log a clear error when batch JSON parsing throws", async () => {
      const malformedBatchJson = "[{ urgencyScore: BROKEN }]";
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        malformedBatchJson,
      );

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "analyzePriorityBatch: Failed to parse batch priority response",
        ),
        expect.any(Error),
      );

      // All emails should get fallback values
      expect(results.get("email-1")?.category).toBe("Other");
      expect(results.get("email-2")?.category).toBe("Other");
    });

    it("should use preComputedSentimentScore from each email in batch, not LLM output", async () => {
      // Batch emails with pre-computed sentiment scores from the summary step
      const batchEmailsWithSentiment = [
        {
          emailKey: "email-1",
          from: "sender1@example.com",
          subject: "Angry customer",
          body: "Summary of angry customer email",
          preComputedSentimentScore: -0.9,
        },
        {
          emailKey: "email-2",
          from: "sender2@example.com",
          subject: "Happy feedback",
          body: "Summary of positive feedback email",
          preComputedSentimentScore: 0.7,
        },
      ];

      // LLM response intentionally includes sentimentScore — these should be ignored
      const responseWithLlmSentiment = JSON.stringify({
        priority_results: [
          {
            key: "email-1",
            urgencyScore: 80,
            urgencyExplanation: "Upset customer",
            /* LLM value — should be ignored */
            sentimentScore: 0,
            goalAlignmentScore: 70,
            goalAlignmentExplanation: "Support issue",
            category: "Customer Support",
            categoryExplanation: "Complaint",
            reasoning: "Angry customer requiring prompt response",
          },
          {
            key: "email-2",
            urgencyScore: 20,
            urgencyExplanation: "Positive feedback, no action needed",
            /* LLM value — should be ignored */
            sentimentScore: 0,
            goalAlignmentScore: 30,
            goalAlignmentExplanation: "Positive signal",
            category: "Customer Support",
            categoryExplanation: "Feedback",
            reasoning: "Happy feedback, low urgency",
          },
        ],
      });
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        responseWithLlmSentiment,
      );

      const results = await service.analyzePriorityBatch(
        batchEmailsWithSentiment,
      );

      // Pre-computed sentiment should be used — LLM sentimentScore (0) must be ignored
      expect(results.get("email-1")?.sentimentScore).toBe(-0.9);
      expect(results.get("email-2")?.sentimentScore).toBe(0.7);
    });

    it("should return sentimentScore: undefined for batch emails without preComputedSentimentScore", async () => {
      // batchEmails has no preComputedSentimentScore field set
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validBatchResponse,
      );

      const results = await service.analyzePriorityBatch(batchEmails);

      // No pre-computed sentiment — sentimentScore should be undefined so callers
      // skip the DB write rather than overwriting with 0
      expect(results.get("email-1")?.sentimentScore).toBeUndefined();
      expect(results.get("email-2")?.sentimentScore).toBeUndefined();
    });
  });
});
