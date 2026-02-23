import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PriorityAnalysisService } from "./priority-analysis.service";
import { LLMCoreService } from "./llm-core.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import * as prompts from "./prompts";

jest.mock("./prompts", () => ({
  getPrompt: jest.fn(),
  renderPrompt: jest.fn(),
  loadPrompts: jest.fn(),
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

      const result = await service.analyzePriority(mockEmail);

      expect(result.category).toBe("Customer Support");
      expect(result.categoryExplanation).toBe("Support request");
      expect(result.urgencyScore).toBe(50);
      expect(result.sentimentScore).toBe(0);
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

      const result = await service.analyzePriority(mockEmail);

      expect(result.category).toBe("Sales");
      expect(result.urgencyScore).toBe(75);
    });

    it("should pass jsonMode: true to LLM to enforce JSON responses", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        validPriorityResponse,
      );

      await service.analyzePriority(mockEmail);

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

      await service.analyzePriority(mockEmail);

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

      const result = await service.analyzePriority(
        mockEmail,
        undefined,
        undefined,
        "user-123",
      );

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

      const result = await service.analyzePriority(
        mockEmail,
        undefined,
        undefined,
        "user-456",
      );

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

      const result = await service.analyzePriority(mockEmail);

      expect(result.urgencyExplanation).toBe("Contains urgent keywords");
      expect(result.urgencyScore).toBeGreaterThan(0);
    });

    it("should throw StructuralError when prompt template is not found", async () => {
      (prompts.getPrompt as jest.Mock).mockReturnValue(null);

      await expect(service.analyzePriority(mockEmail)).rejects.toThrow(
        "Prompt template not found: analyze_priority",
      );
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

      const result = await service.analyzePriority(mockEmail);

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

    const validBatchResponse = JSON.stringify([
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
    ]);

    it("should parse a valid batch JSON response correctly", async () => {
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
      // Only returns result for email-1, not email-2
      const partialResponse = JSON.stringify([
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
      ]);
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

    it("should return empty map for empty email list", async () => {
      const results = await service.analyzePriorityBatch([]);

      expect(results.size).toBe(0);
      expect(mockLLMCoreService.generateText).not.toHaveBeenCalled();
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
  });
});
