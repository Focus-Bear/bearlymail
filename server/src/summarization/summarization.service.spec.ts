import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { EmailsService } from "../emails/emails.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { SummarizationService } from "./summarization.service";

describe("SummarizationService", () => {
  let service: SummarizationService;

  const mockEmailsService = {
    getEmailById: jest.fn(),
    getThreadEmails: jest.fn(),
  };

  const mockLLMService = {
    summarizeEmail: jest.fn(),
    generateText: jest.fn(),
    summarizeEmailWithPhishingCheck: jest.fn(),
    checkPhishingOnly: jest.fn(),
  };

  const mockSummarizationRuleRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockErrorTrackingService = {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  };

  const mockUsersService = {
    findOneForAuth: jest.fn().mockResolvedValue({ email: "user@example.com" }),
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
        {
          provide: ErrorTrackingService,
          useValue: mockErrorTrackingService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<SummarizationService>(SummarizationService);
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

    it("should throw error and track it when LLM fails", async () => {
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

      await expect(
        service.summarizeEmail(userId, emailId, rule),
      ).rejects.toThrow("LLM service unavailable");

      expect(mockErrorTrackingService.captureException).toHaveBeenCalledWith(
        error,
        userId,
        expect.objectContaining({
          operation: "summarize_email",
          ruleType: "bullet-points",
          emailId,
        }),
      );
    });
  });

  describe("summarizeEmailWithPhishing (custom prompt)", () => {
    it("should run custom prompt for summary AND separate phishing check when rule.type is custom", async () => {
      const userId = "user-123";
      const emailId = "email-456";
      const rule = {
        type: "custom" as const,
        customPrompt: "List all action items from this email.",
      };
      const mockEmail = {
        id: emailId,
        subject: "Phishing Test",
        body: "Click here to verify your account: https://evil.xyz/login",
        threadId: "thread-456",
        from: "noreply@evil.xyz",
      };
      const mockSummary = "Action items: 1. Verify account (suspicious)";
      const mockPhishingResult = {
        is_phishing: true,
        confidence: "high" as const,
        reason: "Domain evil.xyz does not match any legitimate service.",
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockUsersService.findOneForAuth.mockResolvedValue({
        email: "user@example.com",
      });
      mockLLMService.generateText.mockResolvedValue(mockSummary);
      mockLLMService.checkPhishingOnly.mockResolvedValue(mockPhishingResult);

      const result = await service.summarizeEmailWithPhishing(
        userId,
        emailId,
        rule,
      );

      expect(result.summary).toBe(mockSummary);
      expect(result.phishingSignal).toMatchObject({
        confidence: "high",
        reason: expect.stringContaining("evil.xyz"),
      });

      // Custom prompt must be used for the summary
      expect(mockLLMService.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("List all action items"),
        }),
        undefined,
        userId,
      );

      // Phishing check must run separately (not via the combined call)
      expect(mockLLMService.checkPhishingOnly).toHaveBeenCalled();
      expect(
        mockLLMService.summarizeEmailWithPhishingCheck,
      ).not.toHaveBeenCalled();
    });

    it("should still detect phishing for custom prompt even when summarisation succeeds", async () => {
      const userId = "user-123";
      const emailId = "email-789";
      const rule = {
        type: "custom" as const,
        customPrompt: "Summarise in one sentence.",
      };
      const mockEmail = {
        id: emailId,
        subject: "Your account requires action",
        body: "Verify now: https://bank-secure.ru/verify",
        threadId: "thread-789",
        from: "security@bank-secure.ru",
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockUsersService.findOneForAuth.mockResolvedValue({
        email: "user@example.com",
      });
      mockLLMService.generateText.mockResolvedValue(
        "Email asks you to verify account.",
      );
      mockLLMService.checkPhishingOnly.mockResolvedValue({
        is_phishing: true,
        confidence: "high" as const,
        reason: "Domain bank-secure.ru is a suspicious credential harvester.",
      });

      const result = await service.summarizeEmailWithPhishing(
        userId,
        emailId,
        rule,
      );

      expect(result.phishingSignal).not.toBeNull();
      expect(result.phishingSignal?.confidence).toBe("high");
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
