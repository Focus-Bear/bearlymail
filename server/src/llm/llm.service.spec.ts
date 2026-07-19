import { Test, TestingModule } from "@nestjs/testing";

import { extractPlainSummary, LLMService } from "./llm.service";
import { LLMProvider } from "./llm.types";
import { LLMActionsService } from "./llm-actions.service";
import { LLMAskService } from "./llm-ask.service";
import { LLMCategoriesService } from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";
import { LLMMiscService } from "./llm-misc.service";
import { LLMPatternsService } from "./llm-patterns.service";
import { LLMReplyService } from "./llm-reply.service";
import { LLMSearchService } from "./llm-search.service";
import { LLMSummarizationService } from "./llm-summarization.service";
import { LLMToneService } from "./llm-tone.service";
import * as prompts from "./prompts";
import { getPrompt, loadPrompts } from "./prompts";

describe("LLMService", () => {
  let service: LLMService;
  let mockLLMCoreService: jest.Mocked<
    Pick<
      LLMCoreService,
      "generateText" | "getAvailableProviders" | "getDefaultProvider"
    >
  >;

  beforeEach(async () => {
    mockLLMCoreService = {
      generateText: jest.fn().mockResolvedValue("Generated text"),
      getAvailableProviders: jest.fn().mockReturnValue([LLMProvider.OPENAI]),
      getDefaultProvider: jest.fn().mockReturnValue(LLMProvider.OPENAI),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        { provide: LLMCoreService, useValue: mockLLMCoreService },
        LLMActionsService,
        LLMAskService,
        LLMCategoriesService,
        LLMMiscService,
        LLMPatternsService,
        LLMReplyService,
        LLMSearchService,
        LLMSummarizationService,
        LLMToneService,
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
  });

  describe("Prompt Loading", () => {
    it("should load all required prompts from markdown files", () => {
      const prompts = loadPrompts();

      // Verify all critical prompts are loaded
      const requiredPrompts = [
        "analyze_priority",
        "analyze_email_patterns",
        "generate_reply",
        "generate_multiple_replies",
        "generate_meeting_reply",
        "generate_follow_up",
        "check_tone_style",
        "extract_action_items",
        "suggest_actions",
        "summarize_email_tldr",
        "summarize_email_bullets",
        "summarize_email_actions",
        "classify_email_type",
        "generate_qa_answer",
        "detect_opt_out",
        "search_relevance_explanation",
      ];

      requiredPrompts.forEach((promptId) => {
        const prompt = prompts.get(promptId);
        expect(prompt).toBeDefined();
        expect(prompt?.id).toBe(promptId);
        expect(prompt?.prompt).toBeTruthy();
        expect(prompt?.prompt.length).toBeGreaterThan(0);
      });
    });

    it("should load extract_action_items prompt", () => {
      const prompt = getPrompt("extract_action_items");
      expect(prompt).not.toBeNull();
      expect(prompt?.id).toBe("extract_action_items");
      expect(prompt?.prompt).toContain("action");
    });

    it("should load generate_reply prompt", () => {
      const prompt = getPrompt("generate_reply");
      expect(prompt).not.toBeNull();
      expect(prompt?.id).toBe("generate_reply");
      expect(prompt?.prompt.length).toBeGreaterThan(0);
    });

    it("should load generate_multiple_replies prompt", () => {
      const prompt = getPrompt("generate_multiple_replies");
      expect(prompt).not.toBeNull();
      expect(prompt?.id).toBe("generate_multiple_replies");
      expect(prompt?.prompt.length).toBeGreaterThan(0);
    });

    it("should load suggest_actions prompt", () => {
      const prompt = getPrompt("suggest_actions");
      expect(prompt).not.toBeNull();
      expect(prompt?.id).toBe("suggest_actions");
      expect(prompt?.prompt.length).toBeGreaterThan(0);
    });

    it("should load check_tone_style prompt", () => {
      const prompt = getPrompt("check_tone_style");
      expect(prompt).not.toBeNull();
      expect(prompt?.id).toBe("check_tone_style");
      expect(prompt?.prompt.length).toBeGreaterThan(0);
    });

    it("should return null for non-existent prompt", () => {
      const prompt = getPrompt("non_existent_prompt");
      expect(prompt).toBeNull();
    });
  });

  describe("Service Initialization", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should initialize with default provider", () => {
      const providers = service.getAvailableProviders();
      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
    });

    it("should have getDefaultProvider method", () => {
      const defaultProvider = service.getDefaultProvider();
      expect(defaultProvider).toBeDefined();
      expect(typeof defaultProvider).toBe("string");
    });
  });

  describe("Error Handling", () => {
    it("should throw error when generate_reply prompt is missing", async () => {
      // Mock getPrompt to return null
      jest.spyOn(prompts, "getPrompt").mockReturnValueOnce(null);

      await expect(
        service.generateReplyDraft(
          {
            from: "sender@example.com",
            subject: "Test",
            body: "Test body",
          },
          { tone: "professional" },
          undefined,
          "test-user-id",
        ),
      ).rejects.toThrow("Reply generation prompt not available");
    });

    it("should use fallback when generate_multiple_replies prompt is missing", async () => {
      // Mock getPrompt to return null for generate_multiple_replies, then valid for generate_reply
      jest
        .spyOn(prompts, "getPrompt")
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({
          prompt: "Generate a reply",
          systemPrompt: "You are a helpful assistant",
        });

      // Mock llmCoreService.generateText for the fallback
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValueOnce(
        "Fallback reply",
      );

      const result = await service.generateReplyOptions(
        {
          from: "sender@example.com",
          subject: "Test",
          body: "Test body",
        },
        { tone: "professional" },
        undefined,
        "test-user-id",
      );

      expect(result).toEqual([
        { label: "Draft Reply", text: "Fallback reply" },
      ]);
    });

    it("should throw error when generate_meeting_reply prompt is missing", async () => {
      // Mock getPrompt to return null for generate_meeting_reply
      jest.spyOn(prompts, "getPrompt").mockReturnValueOnce(null);

      await expect(
        service.generateMeetingReply(
          {
            from: "sender@example.com",
            subject: "Meeting Request",
            body: "Let's schedule a meeting",
          },
          [{ start: "2026-02-12T10:00:00Z", end: "2026-02-12T11:00:00Z" }],
          undefined,
          undefined,
          "test-user-id",
        ),
      ).rejects.toThrow("Meeting reply generation prompt not available");
    });
  });

  describe("Prompt Integration", () => {
    it("should verify all prompts referenced in code exist", () => {
      // This test ensures we don't have typos in prompt IDs
      const promptIds = [
        "analyze_priority",
        "analyze_email_patterns",
        "generate_reply",
        "generate_multiple_replies",
        "generate_meeting_reply",
        "generate_follow_up",
        "check_tone_style",
        "extract_action_items",
        "suggest_actions",
        "summarize_email_tldr",
        "summarize_email_bullets",
        "summarize_email_actions",
        "classify_email_type",
        "generate_qa_answer",
        "detect_opt_out",
        "redact_names",
        "validate_writing_example",
        "dispute_tone_check",
        "consolidate_categories",
        "generate_categories_from_other",
        "search_relevance_explanation",
      ];

      promptIds.forEach((promptId) => {
        const prompt = getPrompt(promptId);
        expect(prompt).not.toBeNull();
        expect(prompt?.id).toBe(promptId);
      });
    });
  });

  describe("generateReplyOptions with thread context (#885)", () => {
    it("should call generateText with a prompt containing thread context when threadMessages is provided", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          options: [
            { label: "Agree", text: "Sure, I'll do that." },
            { label: "Defer", text: "Let me check and get back to you." },
          ],
        }),
      );

      const threadMessages = [
        {
          from: "sarah@example.com",
          fromName: "Sarah Chen",
          body: "Can you share your notes from the sprint?",
          receivedAt: new Date("2026-01-10T10:00:00Z"),
          isFromUser: false,
        },
        {
          from: "alex@example.com",
          fromName: "Alex Rodriguez",
          body: "Sure, I'll push everything by end of week.",
          receivedAt: new Date("2026-01-11T09:00:00Z"),
          isFromUser: true,
        },
      ];

      await service.generateReplyOptions(
        {
          from: "sarah@example.com",
          fromName: "Sarah Chen",
          subject: "Project notes",
          body: "Have you pushed the notes yet?",
        },
        { tone: "professional", userName: "Alex" },
        undefined,
        "test-user-id",
        threadMessages,
      );

      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(1);
      const [[callArgs]] = (mockLLMCoreService.generateText as jest.Mock).mock
        .calls;
      // The rendered prompt should include prior conversation context
      expect(callArgs.prompt).toContain("Prior Conversation");
      expect(callArgs.prompt).toContain("Sarah Chen");
    });

    it("should call generateText without thread context block when threadMessages is empty", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          options: [
            { label: "Agree", text: "Sure, sounds good." },
            { label: "Defer", text: "Let me think about it." },
          ],
        }),
      );

      await service.generateReplyOptions(
        {
          from: "sender@example.com",
          subject: "Test",
          body: "Test body",
        },
        { tone: "professional" },
        undefined,
        "test-user-id",
        [],
      );

      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(1);
      const [[callArgs]] = (mockLLMCoreService.generateText as jest.Mock).mock
        .calls;
      // No thread context block should appear when there are no prior messages
      expect(callArgs.prompt).not.toContain("Prior Conversation");
    });

    it("should work correctly when threadMessages is omitted (backward compat)", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          options: [
            { label: "Agree", text: "Sure." },
            { label: "Defer", text: "Later." },
          ],
        }),
      );

      const result = await service.generateReplyOptions(
        {
          from: "sender@example.com",
          subject: "Test",
          body: "Test body",
        },
        { tone: "professional" },
        undefined,
        "test-user-id",
        // threadMessages deliberately omitted
      );

      expect(result).toHaveLength(2);
      expect(mockLLMCoreService.generateText).toHaveBeenCalledTimes(1);
    });
  });

  describe("extractPlainSummary (issue #1156)", () => {
    it("returns plain text unchanged", () => {
      expect(extractPlainSummary("This is a normal summary.")).toBe(
        "This is a normal summary.",
      );
    });

    it("extracts summary field from JSON object", () => {
      const input = JSON.stringify({
        summary: "3 open PRs need review",
        pr_count: 3,
        status: "pending",
      });
      expect(extractPlainSummary(input)).toBe("3 open PRs need review");
    });

    it("falls back to title if summary field is absent", () => {
      const input = JSON.stringify({ title: "Sprint update", count: 5 });
      expect(extractPlainSummary(input)).toBe("Sprint update");
    });

    it("falls back to description if summary and title are absent", () => {
      const input = JSON.stringify({
        description: "Weekly digest",
        count: 5,
      });
      expect(extractPlainSummary(input)).toBe("Weekly digest");
    });

    it("converts unknown keys to key: value pairs when no preferred fields present", () => {
      const input = JSON.stringify({ pr_count: 3, status: "pending" });
      expect(extractPlainSummary(input)).toBe("pr_count: 3\nstatus: pending");
    });

    it("handles JSON array of strings", () => {
      const input = JSON.stringify(["First item", "Second item"]);
      expect(extractPlainSummary(input)).toBe("First item\nSecond item");
    });

    it("returns trimmed string when JSON.parse fails", () => {
      expect(extractPlainSummary("  not json at all  ")).toBe(
        "not json at all",
      );
    });

    it("returns trimmed string for non-object JSON (number)", () => {
      expect(extractPlainSummary("42")).toBe("42");
    });

    it("handles JSON with empty preferred fields and falls back to pairs", () => {
      const input = JSON.stringify({ summary: "   ", pr_count: 7 });
      expect(extractPlainSummary(input)).toBe("pr_count: 7");
    });

    it("trims the input before processing", () => {
      const input = `  ${JSON.stringify({ summary: "Clean summary" })}  `;
      expect(extractPlainSummary(input)).toBe("Clean summary");
    });

    it("extracts summary when JSON is wrapped in markdown fences", () => {
      const inner = JSON.stringify({ summary: "Fenced", extra: 1 });
      const input = `\`\`\`json\n${inner}\n\`\`\``;
      expect(extractPlainSummary(input)).toBe("Fenced");
    });

    it("extracts JSON that is preceded by a short preamble", () => {
      const obj = { summary: "After preamble", x: 1 };
      const input = `Here is the result:\n${JSON.stringify(obj)}`;
      expect(extractPlainSummary(input)).toBe("After preamble");
    });

    it("recovers the summary from a TRUNCATED structured response (raw-JSON leak)", () => {
      // Token-limit truncation cuts the object mid-way, so JSON.parse fails.
      // The summary field is emitted first, so it must still be recovered
      // instead of leaking the whole blob into the TL;DR.
      const full = JSON.stringify({
        summary:
          "Ari Star via LinkedIn has accepted your connection invitation.",
        phishing: null,
        sentiment: { score: 0.2, explanation: "neutral" },
        category: "Social & LinkedIn Notifications",
        meetingProposal: { hasProposal: false, proposedLocalTime: null },
      });
      const truncated = full.slice(0, full.length - 25);
      const result = extractPlainSummary(truncated);
      expect(result).toBe(
        "Ari Star via LinkedIn has accepted your connection invitation.",
      );
      expect(result).not.toContain("{");
      expect(result).not.toContain("meetingProposal");
    });

    it("recovers a summary containing escaped quotes from truncated JSON", () => {
      const truncated =
        '{"summary":"He said \\"hi\\" to the team","sentiment":{"sco';
      expect(extractPlainSummary(truncated)).toBe('He said "hi" to the team');
    });

    it("recovers a summary with literal newlines from truncated JSON", () => {
      // Models frequently emit raw newlines inside the string, which are
      // invalid in a JSON string literal and would otherwise fail recovery.
      const truncated = '{"summary":"Line one.\nLine two.","sentiment":{"sco';
      expect(extractPlainSummary(truncated)).toBe("Line one.\nLine two.");
    });
  });

  describe("parseSummaryWithPhishing success-path sanitisation (issue #1162)", () => {
    // parseSummaryWithPhishing moved to LLMSummarizationService (Phase 7a, #939).
    // Access it via a minimal instance that only needs LLMCoreService.
    let summarizationService: LLMSummarizationService;

    beforeEach(() => {
      // parseSummaryWithPhishing is a pure synchronous method — LLMCoreService
      // is never called, so null is safe here.
      summarizationService = new LLMSummarizationService(null);
    });

    it("sanitises a plain-text summary in the success path", () => {
      const response = JSON.stringify({
        summary: "This email asks you to review the attached proposal.",
        phishing: null,
        sentiment: null,
        category: null,
        categoryExplanation: null,
      });
      const result = summarizationService.parseSummaryWithPhishing(response);
      expect(result.summary).toBe(
        "This email asks you to review the attached proposal.",
      );
    });

    it("sanitises a JSON-embedded summary string in the success path (fix #1162)", () => {
      // Simulate the LLM embedding a JSON object inside the summary field
      // (can happen with custom howToSummarize rules).
      const response = JSON.stringify({
        summary: JSON.stringify({ key: "embedded JSON value" }),
        phishing: null,
        sentiment: null,
        category: null,
        categoryExplanation: null,
      });
      const result = summarizationService.parseSummaryWithPhishing(response);
      // extractPlainSummary should extract the value, not return raw JSON
      expect(result.summary).not.toContain("{");
      expect(result.summary).not.toContain("}");
      expect(result.summary).toBe("key: embedded JSON value");
    });

    it("fallback path sanitises correctly (regression guard)", () => {
      // Non-JSON input — exercises the fallback path.
      const result = summarizationService.parseSummaryWithPhishing(
        "  plain fallback summary  ",
      );
      expect(result.summary).toBe("plain fallback summary");
    });

    it("parses JSON when the summary string contains a closing brace (greedy-regex regression)", () => {
      const inner =
        "Action required: if spending exceeds $250/month before April 1, 2026, access pauses — review billing.";
      const response = JSON.stringify({
        summary: inner,
        phishing: {
          is_phishing: false,
          confidence: "low",
          reason: "Legitimate notice; no credential harvesting.",
        },
        sentiment: { score: 0, explanation: "Neutral informational tone." },
        category: "Other",
        categoryExplanation: "Service usage notice.",
        actionItems: [],
      });
      const result = summarizationService.parseSummaryWithPhishing(response);
      expect(result.summary).toBe(inner);
      expect(result.phishing?.is_phishing).toBe(false);
    });

    it("recovers the summary when the structured response is truncated", () => {
      // Reproduces the raw-JSON-in-TL;DR bug: a token-truncated response makes
      // tryParseJsonObjectFromLlmResponse return null, so the fallback runs.
      const full = JSON.stringify({
        summary: "LinkedIn accepted your connection invitation.",
        phishing: null,
        sentiment: { score: 0.2, explanation: "neutral" },
        category: "Social",
        meetingProposal: { hasProposal: false, proposedLocalTime: null },
      });
      const truncated = full.slice(0, full.length - 20);
      const result = summarizationService.parseSummaryWithPhishing(truncated);
      expect(result.summary).toBe(
        "LinkedIn accepted your connection invitation.",
      );
      expect(result.summary).not.toContain("{");
    });

    it("strips markdown fences and still extracts the summary", () => {
      const payload = {
        summary: "Short TL;DR line.",
        phishing: null,
        sentiment: { score: 0, explanation: "Neutral." },
        category: "Other",
        categoryExplanation: "x",
        actionItems: [],
      };
      const wrapped = `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
      const result = summarizationService.parseSummaryWithPhishing(wrapped);
      expect(result.summary).toBe("Short TL;DR line.");
    });
  });
});
