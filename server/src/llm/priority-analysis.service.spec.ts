import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { QUERY_LIMITS } from "../constants/query-limits";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { CategoryShortlistService } from "./category-shortlist.service";
import { LLMProvider } from "./llm.types";
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
    CATEGORY_SHORTLIST: "category_shortlist",
    BATCH_PRIORITY_TRIAGE: "batch_priority_triage",
  },
  UTILITY_PROMPT_IDS: {
    CATEGORISE_SUMMARY: "categorise_summary",
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

const validCategoryResponse = JSON.stringify({
  result: {
    categoryNumber: 4,
    categoryName: "Customer Support",
    categoryConfidence: "HIGH",
    reasoning: "Support request",
  },
});

const validTriageResponse = JSON.stringify({
  results: [
    { key: "email-1", needsReanalysis: true, reason: "new deadline" },
    { key: "email-2", needsReanalysis: false, reason: "routine follow-up" },
  ],
});

type LlmReply = string | (() => Promise<string>);

function toQueue(
  value: LlmReply | LlmReply[] | undefined,
  fallback: string,
): LlmReply[] {
  if (value === undefined) return [fallback];
  return Array.isArray(value) ? [...value] : [value];
}

/**
 * Routes mocked LLM replies by operation: the category step (categorise_summary)
 * runs before every priority call (analyze_priority), and batches start with a
 * triage call. An array is consumed in order (the last entry repeats); a thunk
 * can reject.
 */
function routeLlm(
  generateText: jest.Mock,
  overrides: {
    categorise?: LlmReply | LlmReply[];
    priority?: LlmReply | LlmReply[];
    triage?: LlmReply | LlmReply[];
  } = {},
): void {
  const queues = {
    categorise: toQueue(overrides.categorise, validCategoryResponse),
    priority: toQueue(overrides.priority, validPriorityResponse),
    triage: toQueue(overrides.triage, validTriageResponse),
  };
  generateText.mockImplementation(async (request: { operation?: string }) => {
    let queue = queues.priority;
    if (request.operation === "categorise_summary") queue = queues.categorise;
    if (request.operation === "batch_priority_triage") queue = queues.triage;
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return typeof next === "function" ? next() : next;
  });
}

describe("PriorityAnalysisService", () => {
  let service: PriorityAnalysisService;
  let mockLLMCoreService: jest.Mocked<Partial<LLMCoreService>>;
  let mockErrorTrackingService: jest.Mocked<Partial<ErrorTrackingService>>;
  let mockCategoryShortlistService: jest.Mocked<
    Partial<CategoryShortlistService>
  >;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockLLMCoreService = {
      generateText: jest.fn(),
      getDefaultProvider: jest.fn().mockReturnValue(LLMProvider.OPENAI),
    };

    mockErrorTrackingService = {
      captureException: jest.fn(),
    };

    mockCategoryShortlistService = {
      isShortlistEnabled: jest.fn().mockReturnValue(false),
      getShortlist: jest.fn(),
      getShortlistWithMeta: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
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
        {
          provide: CategoryShortlistService,
          useValue: mockCategoryShortlistService,
        },
        { provide: ConfigService, useValue: mockConfigService },
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
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.category).toBe("Customer Support");
      // The category and its explanation come from the category step, not the
      // priority response.
      expect(result.categoryExplanation).toBe("Support request");
      expect(result.urgencyScore).toBe(50);
      // sentimentScore is not derived from LLM output — it comes from preComputedSentimentScore.
      // When no pre-computed value is passed, the result is undefined so the caller
      // does not clobber the DB value that was set during the summary step.
      expect(result.sentimentScore).toBeUndefined();
    });

    it("should use preComputedSentimentScore when provided, ignoring LLM sentiment", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

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
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        priority: legacyResponse,
        categorise: JSON.stringify({
          result: {
            categoryNumber: 2,
            categoryName: "Sales",
            categoryConfidence: "HIGH",
            reasoning: "Sales inquiry",
          },
        }),
      });

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.category).toBe("Sales");
      expect(result.urgencyScore).toBe(75);
    });

    it("should pass jsonMode: true to LLM to enforce JSON responses", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriority({ email: mockEmail });

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonMode: true,
          model: "amazon.nova-micro-v1:0",
        }),
        LLMProvider.BEDROCK,
        undefined,
      );
    });

    it("should use LLM_MAX_TOKENS_MEDIUM to prevent JSON truncation", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriority({ email: mockEmail });

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        }),
        LLMProvider.BEDROCK,
        undefined,
      );
    });

    it("honours an explicit provider instead of forcing Bedrock", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriority({
        email: mockEmail,
        provider: LLMProvider.GEMINI,
      });

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: undefined }),
        LLMProvider.GEMINI,
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

      // Fallback values should be returned; the category step also got the
      // unusable reply, so the category is Other with its own explanation.
      expect(result.category).toBe("Other");
      expect(result.categoryExplanation).toBe(
        "Category model unavailable — left as Other",
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

      // The category step also got the unusable reply → Other with its own explanation.
      expect(result.category).toBe("Other");
      expect(result.categoryExplanation).toBe(
        "Category model unavailable — left as Other",
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

    it("should return shortlistedCategoryNames as null when shortlisting is disabled", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);
      mockCategoryShortlistService.isShortlistEnabled = jest
        .fn()
        .mockReturnValue(false);

      const result = await service.analyzePriority({ email: mockEmail });

      expect(result.shortlistedCategoryNames).toBeNull();
    });

    it("should return shortlistedCategoryNames with category names when shortlisting is enabled", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);
      mockCategoryShortlistService.isShortlistEnabled = jest
        .fn()
        .mockReturnValue(true);
      (
        mockCategoryShortlistService.getShortlistWithMeta as jest.Mock
      ).mockResolvedValue({
        effective: [
          { name: "Customer Support", categoryKey: "customer_support" },
          { name: "Engineering", categoryKey: "engineering" },
        ],
        candidates: [
          { name: "Customer Support", score: 0.9, pinned: false },
          { name: "Engineering", score: 0.8, pinned: false },
        ],
      });

      const result = await service.analyzePriority({
        email: mockEmail,
        userContext: {
          emailCategories: [
            { name: "Customer Support", categoryKey: "customer_support" },
            { name: "Engineering", categoryKey: "engineering" },
            { name: "Sales", categoryKey: "sales" },
          ],
          protoCategories: [],
        },
      });

      expect(result.shortlistedCategoryNames).toEqual([
        "Customer Support",
        "Engineering",
      ]);
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
        existingCategory: "Customer Support",
        existingUrgencyScore: 60,
      },
      {
        emailKey: "email-2",
        from: "sender2@example.com",
        subject: "Second email",
        body: "Body 2",
        existingCategory: "Admin",
        existingUrgencyScore: 20,
      },
    ];

    beforeEach(() => {
      (prompts.getPrompt as jest.Mock).mockImplementation((id: string) => {
        if (id === "batch_priority_triage") {
          return {
            id: "batch_priority_triage",
            prompt: "Triage: {{emailList}}",
            systemPrompt: "You are a triage assistant.",
          };
        }
        return {
          id: "analyze_priority",
          prompt: "Analyze this email: {{subject}}",
          systemPrompt: "You are an email analyzer.",
        };
      });
    });

    it("should return empty map for empty email list", async () => {
      const results = await service.analyzePriorityBatch([]);

      expect(results.size).toBe(0);
      expect(mockLLMCoreService.generateText).not.toHaveBeenCalled();
    });

    it("should pass jsonMode: true to LLM for the triage call", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriorityBatch(batchEmails);

      expect(mockLLMCoreService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({ jsonMode: true }),
        LLMProvider.BEDROCK,
        undefined,
      );
    });

    it("should mark non-flagged emails as triagePreserved and only run individual analysis for flagged ones", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-1")?.triagePreserved).toBeFalsy();
      expect(results.get("email-1")?.category).toBe("Customer Support");
      expect(results.get("email-2")?.isFallback).toBe(false);
      expect(results.get("email-2")?.triagePreserved).toBe(true);
      // 1 triage + (category + priority) for the one flagged email.
      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(3);
    });

    it("carries categoryConfidence through to individually-analysed batch results", async () => {
      // The batch path's rule-generation gate reads categoryConfidence off each
      // result; if analyzePriorityBatch dropped it, the gate would never fire.
      const highConfidenceResponse = JSON.stringify({
        result: {
          urgencyScore: 50,
          urgencyExplanation: "Moderate urgency",
          sentimentScore: 0,
          goalAlignmentScore: 40,
          goalAlignmentExplanation: "Somewhat aligned",
          category: "Customer Support",
          categoryExplanation: "Support request",
          categoryConfidence: "HIGH",
          reasoning: "Standard support email",
        },
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        priority: highConfidenceResponse,
      });

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(results.get("email-1")?.categoryConfidence).toBe("HIGH");
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-1")?.triagePreserved).toBeFalsy();
    });

    it("should run individual analysis for all emails when triage flags all", async () => {
      const allFlaggedTriage = JSON.stringify({
        results: [
          { key: "email-1", needsReanalysis: true, reason: "urgent" },
          { key: "email-2", needsReanalysis: true, reason: "topic shift" },
        ],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: allFlaggedTriage,
      });

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-2")?.isFallback).toBe(false);
      // 1 triage + 2 × (category + priority).
      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(5);
    });

    it("should reanalyse all emails when triage returns non-JSON response", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: "Sorry, I cannot triage.",
      });

      const loggerWarnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("will reanalyse all emails"),
      );
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-2")?.isFallback).toBe(false);
    });

    it("should reanalyse all emails when triage LLM call throws", async () => {
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: () => Promise.reject(new Error("Triage LLM failed")),
      });

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Triage LLM call failed"),
        expect.any(Error),
      );
      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-2")?.isFallback).toBe(false);
    });

    it("should return isFallback for emails where individual analysis fails", async () => {
      const allFlaggedTriage = JSON.stringify({
        results: [
          { key: "email-1", needsReanalysis: true, reason: "urgent" },
          { key: "email-2", needsReanalysis: true, reason: "topic shift" },
        ],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: allFlaggedTriage,
        priority: [
          validPriorityResponse,
          () => Promise.reject(new Error("LLM failed for email-2")),
        ],
      });

      const results = await service.analyzePriorityBatch(batchEmails);

      expect(results.size).toBe(2);
      expect(results.get("email-1")?.isFallback).toBe(false);
      expect(results.get("email-2")?.isFallback).toBe(true);
    });

    it("should use preComputedSentimentScore from batch email in individual analysis", async () => {
      const emailsWithSentiment = [
        {
          emailKey: "email-1",
          from: "sender1@example.com",
          subject: "Angry customer",
          body: "Summary of angry customer email",
          preComputedSentimentScore: -0.9,
        },
      ];
      const singleFlaggedTriage = JSON.stringify({
        results: [{ key: "email-1", needsReanalysis: true, reason: "urgent" }],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: singleFlaggedTriage,
      });

      const results = await service.analyzePriorityBatch(emailsWithSentiment);

      expect(results.get("email-1")?.sentimentScore).toBe(-0.9);
    });

    it("should log triage count when some emails are skipped", async () => {
      const loggerLogSpy = jest
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => undefined);

      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriorityBatch(batchEmails);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("triage flagged 1/2 existing"),
      );
    });

    it("should force reanalysis for email keys omitted from triage response (fail-open)", async () => {
      // LLM response only mentions email-1, omits email-2
      const partialTriageResponse = JSON.stringify({
        results: [
          { key: "email-1", needsReanalysis: false, reason: "routine" },
        ],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: partialTriageResponse,
      });

      const loggerWarnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      const results = await service.analyzePriorityBatch(batchEmails);

      // email-1 was marked needsReanalysis: false → triagePreserved
      expect(results.get("email-1")?.triagePreserved).toBe(true);
      // email-2 was omitted → fail-open → should be reanalysed, not triagePreserved
      expect(results.get("email-2")?.triagePreserved).toBeFalsy();
      expect(results.get("email-2")?.isFallback).toBe(false);
      expect(results.get("email-2")?.category).toBe("Customer Support");
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('omitted key "email-2"'),
      );
    });

    it("should bypass triage for emails with no existing analysis and analyse them directly", async () => {
      const newEmails = [
        {
          emailKey: "new-1",
          from: "new@example.com",
          subject: "New email",
          body: "Body",
          // no existingCategory, no existingUrgencyScore
        },
      ];
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      const loggerLogSpy = jest
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => undefined);

      const results = await service.analyzePriorityBatch(newEmails);

      // Triage should not have been called: category + priority only.
      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(2);
      expect(
        (mockLLMCoreService.generateText as jest.Mock).mock.calls.map(
          (call) => call[0].operation,
        ),
      ).toEqual(["categorise_summary", "analyze_priority"]);
      expect(results.get("new-1")?.isFallback).toBe(false);
      expect(results.get("new-1")?.triagePreserved).toBeFalsy();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("no emails with existing analysis"),
      );
    });

    it("should route new emails to analysis and apply triage only to emails with existing analysis", async () => {
      const mixedEmails = [
        {
          emailKey: "existing-1",
          from: "a@example.com",
          subject: "Existing email",
          body: "Body",
          existingCategory: "Admin",
          existingUrgencyScore: 30,
        },
        {
          emailKey: "new-2",
          from: "b@example.com",
          subject: "New email",
          body: "Body",
          // no existingCategory, no existingUrgencyScore
        },
      ];
      const triagePreservesExisting = JSON.stringify({
        results: [
          { key: "existing-1", needsReanalysis: false, reason: "no change" },
        ],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: triagePreservesExisting,
      });

      const results = await service.analyzePriorityBatch(mixedEmails);

      // existing-1: triage said no reanalysis → triagePreserved
      expect(results.get("existing-1")?.triagePreserved).toBe(true);
      // new-2: bypassed triage → got individual analysis
      expect(results.get("new-2")?.isFallback).toBe(false);
      expect(results.get("new-2")?.triagePreserved).toBeFalsy();
      // 3 LLM calls: 1 triage + (category + priority) for new-2
      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(3);
    });
  });

  describe("category shortlist integration", () => {
    const manyCategories = Array.from({ length: 20 }, (_, i) => ({
      name: `Category ${i + 1}`,
    }));

    it("should call getShortlistWithMeta when isShortlistEnabled returns true", async () => {
      const shortlist = [{ name: "Category 1" }];
      (
        mockCategoryShortlistService.isShortlistEnabled as jest.Mock
      ).mockReturnValue(true);
      (
        mockCategoryShortlistService.getShortlistWithMeta as jest.Mock
      ).mockResolvedValue({ effective: shortlist, candidates: [] });
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriority({
        email: mockEmail,
        userContext: { emailCategories: manyCategories },
      });

      expect(
        mockCategoryShortlistService.getShortlistWithMeta,
      ).toHaveBeenCalledTimes(1);
      // getShortlistWithMeta now receives summary (cleaned body) not raw body
      expect(
        mockCategoryShortlistService.getShortlistWithMeta,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ subject: mockEmail.subject }),
        expect.arrayContaining([
          expect.objectContaining({ name: "Category 1" }),
        ]),
      );
      // summary key should be present (not body)
      expect(
        mockCategoryShortlistService.getShortlistWithMeta,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ summary: expect.any(String) }),
        expect.any(Array),
      );
    });

    it("should NOT call getShortlistWithMeta during the triage phase (batch is triage-only)", async () => {
      // The triage phase uses batch-priority-triage.md and does NOT run per-email shortlisting.
      // Shortlisting only happens inside analyzePriority for flagged emails.
      (
        mockCategoryShortlistService.isShortlistEnabled as jest.Mock
      ).mockReturnValue(true);
      (
        mockCategoryShortlistService.getShortlistWithMeta as jest.Mock
      ).mockResolvedValue({
        effective: [{ name: "Category 1" }],
        candidates: [],
      });

      // Triage: no emails flagged for reanalysis → no individual calls → getShortlist never invoked
      const noFlaggedTriage = JSON.stringify({
        results: [
          { key: "email-1", needsReanalysis: false, reason: "routine" },
          { key: "email-2", needsReanalysis: false, reason: "routine" },
        ],
      });
      routeLlm(mockLLMCoreService.generateText as jest.Mock, {
        triage: noFlaggedTriage,
      });

      await service.analyzePriorityBatch(
        [
          {
            emailKey: "email-1",
            from: "a@b.com",
            subject: "Sub 1",
            body: "Body 1",
            existingCategory: "Admin",
            existingUrgencyScore: 30,
          },
          {
            emailKey: "email-2",
            from: "c@d.com",
            subject: "Sub 2",
            body: "Body 2",
            existingCategory: "Admin",
            existingUrgencyScore: 30,
          },
        ],
        { emailCategories: manyCategories },
      );

      expect(
        mockCategoryShortlistService.getShortlistWithMeta,
      ).not.toHaveBeenCalled();
    });

    it("should include combined emailCategories and protoCategories in shortlist input", async () => {
      const protoCategories = [{ name: "Proto Cat" }];
      const shortlist = [{ name: "Category 1" }, { name: "Other" }];
      (
        mockCategoryShortlistService.isShortlistEnabled as jest.Mock
      ).mockReturnValue(true);
      (
        mockCategoryShortlistService.getShortlistWithMeta as jest.Mock
      ).mockResolvedValue({ effective: shortlist, candidates: [] });
      routeLlm(mockLLMCoreService.generateText as jest.Mock);

      await service.analyzePriority({
        email: mockEmail,
        userContext: {
          emailCategories: manyCategories,
          protoCategories,
        },
      });

      // getShortlistWithMeta should receive both email + proto categories merged
      const callArg = (
        mockCategoryShortlistService.getShortlistWithMeta as jest.Mock
      ).mock.calls[0][1] as Array<{ name: string }>;
      expect(callArg.some((cat) => cat.name === "Proto Cat")).toBe(true);
    });
  });
});
