import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { LLMService } from "./llm.service";
import { UsersService } from "../users/users.service";
import { TokenUsageService } from "./token-usage.service";
import { getPrompt, loadPrompts } from "./prompts";
import * as prompts from "./prompts";

describe("LLMService", () => {
  let service: LLMService;
  let mockUsersService: Partial<UsersService>;
  let mockTokenUsageService: Partial<TokenUsageService>;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    // Mock services
    mockUsersService = {
      findOne: jest.fn().mockResolvedValue({
        id: "test-user-id",
        email: "test@example.com",
        name: "Test User",
        openAiApiKey: null,
        toneSettings: { rules: [] },
      }),
    };

    mockTokenUsageService = {
      trackUsage: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          LLM_PROVIDER: "openai",
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "test-key",
          OPENAI_MODEL: "gpt-4",
          GEMINI_API_KEY: process.env.GEMINI_API_KEY,
          GEMINI_MODEL: "gemini-pro",
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: TokenUsageService, useValue: mockTokenUsageService },
        { provide: ConfigService, useValue: mockConfigService },
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
      jest.spyOn(prompts, "getPrompt")
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({
          prompt: "Generate a reply",
          systemPrompt: "You are a helpful assistant",
        });

      // Mock generateText for the fallback
      jest.spyOn(service as any, "generateText").mockResolvedValueOnce("Fallback reply");

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

      expect(result).toEqual([{ label: "Draft Reply", text: "Fallback reply" }]);
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
});
