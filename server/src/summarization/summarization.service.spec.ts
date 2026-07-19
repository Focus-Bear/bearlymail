import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { LLMService } from "../llm/llm.service";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
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
    summarizeCustomPromptWithPhishing: jest.fn(),
  };

  const mockSummarizationRuleRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockUserContextRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockEmailRepository = {
    update: jest.fn().mockResolvedValue({}),
  };

  const mockEmailThreadRepository = {
    update: jest.fn().mockResolvedValue({}),
  };

  const mockErrorTrackingService = {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  };

  const mockUsersService = {
    findOneForAuth: jest.fn().mockResolvedValue({ email: "user@example.com" }),
    findOneForSummary: jest
      .fn()
      .mockResolvedValue({ email: "user@example.com", name: "Test User" }),
  };

  const mockSchedulingPreferencesService = {
    getPreferences: jest
      .fn()
      .mockResolvedValue({ timezone: "Australia/Melbourne" }),
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
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: ErrorTrackingService,
          useValue: mockErrorTrackingService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: SchedulingPreferencesService,
          useValue: mockSchedulingPreferencesService,
        },
      ],
    }).compile();

    service = module.get<SummarizationService>(SummarizationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("persistSummaryForThread", () => {
    it("should write plain summary to all thread emails and stamp lastSummarizedAt with the latest receivedAt", async () => {
      const userId = "user-123";
      const summary = "This is the full-thread summary";
      const olderDate = new Date("2024-01-01");
      const newerDate = new Date("2024-01-02");
      const mockThreadEmails = [
        { id: "email-123", receivedAt: olderDate },
        { id: "email-456", receivedAt: newerDate },
      ];

      mockEmailsService.getThreadEmails.mockResolvedValue(mockThreadEmails);

      await service.persistSummaryForThread(
        userId,
        "thread-123",
        "et-123",
        summary,
      );

      // update() receives a TypeORM In() operator for the id — check the update data
      expect(mockEmailRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.anything() }),
        { summary, summarySource: "llm" },
      );
      // lastSummarizedAt should be the most recent email's receivedAt, not new Date()
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: "et-123" },
        { lastSummarizedAt: newerDate },
      );
    });

    it("should do nothing when thread has no emails", async () => {
      mockEmailsService.getThreadEmails.mockResolvedValue([]);

      await service.persistSummaryForThread(
        "user-123",
        "thread-123",
        "et-123",
        "summary",
      );

      expect(mockEmailRepository.update).not.toHaveBeenCalled();
      expect(mockEmailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("should not update thread when emailThreadId is null", async () => {
      const mockThreadEmails = [
        { id: "email-123", receivedAt: new Date("2024-01-01") },
      ];

      mockEmailsService.getThreadEmails.mockResolvedValue(mockThreadEmails);

      await service.persistSummaryForThread(
        "user-123",
        "thread-123",
        null,
        "summary",
      );

      expect(mockEmailRepository.update).toHaveBeenCalled();
      expect(mockEmailThreadRepository.update).not.toHaveBeenCalled();
    });
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
        "Test User",
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
        "Test User",
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
        "Test User",
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
    it("should send the most recent thread messages (capped) to the LLM when refreshing a summary", async () => {
      const userId = "user-123";
      const emailId = "email-456";
      const rule = { type: "tldr" as const };
      const mockEmail = {
        id: emailId,
        subject: "Thread Subject",
        body: "Latest message",
        threadId: "thread-456",
        from: "sender@example.com",
        emailThreadId: "thread-row-456",
      };
      const mockThreadEmails = Array.from({ length: 7 }, (_, index) => ({
        id: `email-${index + 1}`,
        body: `Thread body ${index + 1}`,
        receivedAt: new Date(`2024-01-0${index + 1}`),
        from: `sender${index + 1}@example.com`,
      }));

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue(mockThreadEmails);
      mockUsersService.findOneForAuth.mockResolvedValue({
        email: "user@example.com",
      });
      mockLLMService.summarizeEmailWithPhishingCheck.mockResolvedValue({
        summary: "Full thread summary",
        phishing: null,
        sentiment: null,
        actionItems: null,
        meetingProposal: null,
      });

      await service.summarizeEmailWithPhishing(userId, emailId, rule);

      expect(mockEmailsService.getThreadEmails).toHaveBeenCalledWith(
        userId,
        "thread-456",
        { order: "DESC", limit: 100 },
      );
      const llmArg =
        mockLLMService.summarizeEmailWithPhishingCheck.mock.calls[0][0];
      expect(llmArg.emailBody).toContain("Thread body 1");
      expect(llmArg.emailBody).toContain("Thread body 7");
    });

    it("should use summarizeCustomPromptWithPhishing for custom rules (single LLM call)", async () => {
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
      const mockPhishingResult = {
        is_phishing: true,
        confidence: "high" as const,
        reason: "Domain evil.xyz does not match any legitimate service.",
      };
      const mockCombinedResult = {
        summary: "Action items: 1. Verify account (suspicious)",
        phishing: mockPhishingResult,
        sentiment: {
          score: -0.8,
          explanation: "Threatening and suspicious tone",
        },
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue([mockEmail]);
      mockUsersService.findOneForAuth.mockResolvedValue({
        email: "user@example.com",
      });
      mockLLMService.summarizeCustomPromptWithPhishing.mockResolvedValue(
        mockCombinedResult,
      );

      const result = await service.summarizeEmailWithPhishing(
        userId,
        emailId,
        rule,
      );

      expect(result.summary).toBe(mockCombinedResult.summary);
      expect(result.phishingSignal).toMatchObject({
        confidence: "high",
        reason: expect.stringContaining("evil.xyz"),
      });

      // Must use the combined single-call method (no separate phishing call)
      expect(
        mockLLMService.summarizeCustomPromptWithPhishing,
      ).toHaveBeenCalled();
      expect(
        mockLLMService.summarizeEmailWithPhishingCheck,
      ).not.toHaveBeenCalled();
    });

    it("should still detect phishing for custom prompt via single combined call", async () => {
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
      mockLLMService.summarizeCustomPromptWithPhishing.mockResolvedValue({
        summary: "Email asks you to verify account.",
        phishing: {
          is_phishing: true,
          confidence: "high" as const,
          reason: "Domain bank-secure.ru is a suspicious credential harvester.",
        },
        sentiment: { score: -0.9, explanation: "Threatening urgency" },
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

describe("matchRuleDeterministic", () => {
  let service: SummarizationService;

  const mockEmailsServiceLocal = {
    getEmailById: jest.fn(),
    getThreadEmails: jest.fn(),
  };

  const mockLLMServiceLocal = {
    summarizeEmail: jest.fn(),
    generateText: jest.fn(),
    summarizeEmailWithPhishingCheck: jest.fn(),
    summarizeCustomPromptWithPhishing: jest.fn(),
  };

  const mockRepoLocal = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SummarizationService,
        { provide: EmailsService, useValue: mockEmailsServiceLocal },
        { provide: LLMService, useValue: mockLLMServiceLocal },
        { provide: UsersService, useValue: {} },
        {
          provide: SchedulingPreferencesService,
          useValue: {
            getPreferences: jest
              .fn()
              .mockResolvedValue({ timezone: "Australia/Melbourne" }),
          },
        },
        {
          provide: ErrorTrackingService,
          useValue: { captureException: jest.fn() },
        },
        {
          provide: getRepositoryToken(SummarizationRuleEntity),
          useValue: mockRepoLocal,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: { update: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SummarizationService>(SummarizationService);
  });

  const makeRule = (
    overrides: Partial<SummarizationRuleEntity>,
  ): SummarizationRuleEntity =>
    ({
      ruleId: "rule-1",
      userId: "u1",
      whenToUse: "description",
      howToSummarize: "summarize",
      fromPatterns: [],
      subjectPatterns: [],
      priority: 0,
      createdAt: new Date("2024-01-01"),
      user: null,
      ...overrides,
    }) as SummarizationRuleEntity;

  it("returns null when rules array is empty", () => {
    expect(service.matchRuleDeterministic({ from: "a@b.com" }, [])).toBeNull();
  });

  it("returns null when no rule matches", () => {
    const rule = makeRule({
      fromPatterns: ["*@github.com"],
    });
    expect(
      service.matchRuleDeterministic({ from: "user@gitlab.com" }, [rule]),
    ).toBeNull();
  });

  it("matches by fromPatterns glob", () => {
    const rule = makeRule({ fromPatterns: ["*@github.com"] });
    expect(
      service.matchRuleDeterministic({ from: "user@github.com" }, [rule]),
    ).toBe(rule);
  });

  it("matches by subjectPatterns substring", () => {
    const rule = makeRule({ subjectPatterns: ["invoice"] });
    expect(
      service.matchRuleDeterministic(
        { from: "any@example.com", subject: "Your invoice is ready" },
        [rule],
      ),
    ).toBe(rule);
  });

  it("matches when both fromPatterns and subjectPatterns are empty (catch-all)", () => {
    const rule = makeRule({ fromPatterns: [], subjectPatterns: [] });
    expect(
      service.matchRuleDeterministic({ from: "x@y.com", subject: "hello" }, [
        rule,
      ]),
    ).toBe(rule);
  });

  it("picks lower-priority rule first", () => {
    const lowPriority = makeRule({
      ruleId: "low",
      priority: 10,
      subjectPatterns: ["invoice"],
    });
    const highPriority = makeRule({
      ruleId: "high",
      priority: 1,
      subjectPatterns: ["invoice"],
    });
    const result = service.matchRuleDeterministic(
      { from: "x@y.com", subject: "Your invoice" },
      [lowPriority, highPriority],
    );
    expect(result?.ruleId).toBe("high");
  });

  it("breaks priority ties using createdAt (older rule wins)", () => {
    const older = makeRule({
      ruleId: "older",
      priority: 0,
      createdAt: new Date("2024-01-01"),
      fromPatterns: ["*@github.com"],
    });
    const newer = makeRule({
      ruleId: "newer",
      priority: 0,
      createdAt: new Date("2024-06-01"),
      fromPatterns: ["*@github.com"],
    });
    const result = service.matchRuleDeterministic({ from: "user@github.com" }, [
      newer,
      older,
    ]);
    expect(result?.ruleId).toBe("older");
  });

  it("requires BOTH fromPatterns AND subjectPatterns to match", () => {
    const rule = makeRule({
      fromPatterns: ["*@github.com"],
      subjectPatterns: ["invoice"],
    });
    // from matches but subject does not
    expect(
      service.matchRuleDeterministic(
        { from: "user@github.com", subject: "Pull request merged" },
        [rule],
      ),
    ).toBeNull();
  });

  it("skips non-matching rules and returns the first matching one", () => {
    const noMatch = makeRule({
      ruleId: "no-match",
      priority: 0,
      fromPatterns: ["*@linear.app"],
    });
    const match = makeRule({
      ruleId: "match",
      priority: 1,
      fromPatterns: ["*@github.com"],
    });
    const result = service.matchRuleDeterministic({ from: "user@github.com" }, [
      noMatch,
      match,
    ]);
    expect(result?.ruleId).toBe("match");
  });
});
