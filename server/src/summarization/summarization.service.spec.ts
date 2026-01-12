import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SummarizationService } from "./summarization.service";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";

describe("SummarizationService", () => {
  let service: SummarizationService;
  let emailsService: EmailsService;
  let llmService: LLMService;

  const mockEmailsService = {
    getEmailById: jest.fn(),
    getThreadEmails: jest.fn(),
  };

  const mockLLMService = {
    summarizeEmail: jest.fn(),
    generateText: jest.fn(),
  };

  const mockSummarizationRuleRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SummarizationService,
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: getRepositoryToken(SummarizationRuleEntity),
          useValue: mockSummarizationRuleRepository,
        },
      ],
    }).compile();

    service = module.get<SummarizationService>(SummarizationService);
    emailsService = module.get<EmailsService>(EmailsService);
    llmService = module.get<LLMService>(LLMService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("summarizeEmail", () => {
    it("should summarize single email", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = { type: "bullet-points" as const };
      const mockEmail = {
        id: emailId,
        subject: "Test Email",
        body: "Test body content",
        threadId: "thread-123",
        from: "test@example.com",
      };
      const mockSummary = "Summary: Test email content";

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockLLMService.summarizeEmail.mockResolvedValue(mockSummary);

      const result = await service.summarizeEmail(userId, emailId, rule);

      expect(result).toBe(mockSummary);
      expect(mockLLMService.summarizeEmail).toHaveBeenCalledWith(
        expect.any(String),
        "Test Email",
        "bullet-points",
        undefined,
        userId,
      );
    });

    it("should summarize thread with multiple messages", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = { type: "action-items" as const };
      const mockEmail = {
        id: emailId,
        subject: "Thread Subject",
        body: "Latest message",
        threadId: "thread-123",
        from: "test@example.com",
      };
      const mockThreadEmails = [
        {
          id: "email-1",
          body: "First message",
          receivedAt: new Date("2024-01-01"),
          from: "sender1@example.com",
        },
        {
          id: "email-2",
          body: "Second message",
          receivedAt: new Date("2024-01-02"),
          from: "sender2@example.com",
        },
        mockEmail,
      ];
      const mockSummary = "Thread summary with action items";

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue(mockThreadEmails);
      mockLLMService.summarizeEmail.mockResolvedValue(mockSummary);

      const result = await service.summarizeEmail(userId, emailId, rule);

      expect(result).toBe(mockSummary);
      expect(mockLLMService.summarizeEmail).toHaveBeenCalledWith(
        expect.stringContaining("Message"),
        "Thread Subject",
        "action-items",
        undefined,
        userId,
      );
    });

    it("should use custom prompt when rule type is custom", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = {
        type: "custom" as const,
        customPrompt: "Extract key decisions",
      };
      const mockEmail = {
        id: emailId,
        subject: "Test Email",
        body: "Test body",
        threadId: "thread-123",
        from: "test@example.com",
      };
      const mockSummary = "Key decisions: ...";

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockLLMService.generateText.mockResolvedValue(mockSummary);

      const result = await service.summarizeEmail(userId, emailId, rule);

      expect(result).toBe(mockSummary);
      expect(mockLLMService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Extract key decisions"),
        }),
        undefined,
        userId,
      );
    });

    it("should use specified provider", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = {
        type: "bullet-points" as const,
        provider: "gemini" as const,
      };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        body: "Test body",
        threadId: "thread-123",
        from: "test@example.com",
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockLLMService.summarizeEmail.mockResolvedValue("Summary");

      await service.summarizeEmail(userId, emailId, rule);

      expect(mockLLMService.summarizeEmail).toHaveBeenCalledWith(
        expect.any(String),
        "Test",
        "bullet-points",
        "gemini",
        userId,
      );
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = { type: "bullet-points" as const };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(
        service.summarizeEmail(userId, emailId, rule),
      ).rejects.toThrow("Email not found");
    });

    it("should use fallback summary when LLM fails", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const rule = { type: "bullet-points" as const };
      const mockEmail = {
        id: emailId,
        subject: "Test Email",
        body: "Test body content",
        threadId: "thread-123",
        from: "test@example.com",
      };
      const error = new Error("LLM service unavailable");

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockLLMService.summarizeEmail.mockRejectedValue(error);
      console.error = jest.fn();

      const result = await service.summarizeEmail(userId, emailId, rule);

      expect(result).toBeDefined();
      expect(console.error).toHaveBeenCalledWith(
        "LLM summarization failed, using fallback",
        error,
      );
    });
  });

  describe("getSummarizationRules", () => {
    it("should return rules for user ordered by createdAt DESC", async () => {
      const userId = "user-123";
      const mockRules = [
        {
          id: "rule-1",
          userId,
          whenToUse: "For long emails",
          howToSummarize: "Use bullet points",
          createdAt: new Date("2024-01-02"),
        },
        {
          id: "rule-2",
          userId,
          whenToUse: "For short emails",
          howToSummarize: "Use TLDR",
          createdAt: new Date("2024-01-01"),
        },
      ];

      mockSummarizationRuleRepository.find.mockResolvedValue(mockRules);

      const result = await service.getSummarizationRules(userId);

      expect(result).toEqual(mockRules);
      expect(mockSummarizationRuleRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: "DESC" },
      });
    });
  });

  describe("createSummarizationRule", () => {
    it("should create a new summarization rule", async () => {
      const userId = "user-123";
      const ruleData = {
        whenToUse: "For technical emails",
        howToSummarize: "Extract code snippets",
      };
      const mockRule = {
        id: "rule-1",
        userId,
        ...ruleData,
      };

      mockSummarizationRuleRepository.create.mockReturnValue(mockRule);
      mockSummarizationRuleRepository.save.mockResolvedValue(mockRule);

      const result = await service.createSummarizationRule(userId, ruleData);

      expect(result).toEqual(mockRule);
      expect(mockSummarizationRuleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          ...ruleData,
        }),
      );
      expect(mockSummarizationRuleRepository.save).toHaveBeenCalledWith(
        mockRule,
      );
    });
  });
});
