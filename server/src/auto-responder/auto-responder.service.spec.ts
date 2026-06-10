import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { AutoResponderAnalyticsService } from "./auto-responder-analytics.service";
import { AutoResponderContextService } from "./auto-responder-context.service";
import { AutoResponderPreviewService } from "./auto-responder-preview.service";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderSuppressionService } from "./auto-responder-suppression.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { DEFAULT_AUTO_RESPONDER_CONFIG } from "./types/auto-responder.types";

// Mock the EmailProviderManager to avoid importing problematic dependencies
jest.mock("../emails/email-provider-manager.service", () => ({
  EmailProviderManager: jest.fn().mockImplementation(() => ({
    getPrimaryProvider: jest.fn(),
  })),
}));

// Import after mocking
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { AutoResponderService } from "./auto-responder.service";

describe("AutoResponderService", () => {
  let module: TestingModule;
  let service: AutoResponderService;
  let userRepository: jest.Mocked<Repository<User>>;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let autoResponseLogRepository: jest.Mocked<Repository<AutoResponseLog>>;
  let autoResponseSuppressionRepository: jest.Mocked<
    Repository<AutoResponseSuppression>
  >;
  let emailClassifierService: jest.Mocked<EmailClassifierService>;
  let queueStatsService: jest.Mocked<QueueStatsService>;
  let emailProviderManager: jest.Mocked<EmailProviderManager>;

  const mockUser = {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    autoResponderSettings: null,
  };

  const mockThread = {
    id: "thread-1",
    userId: "user-1",
    threadId: "gmail-thread-1",
    starCount: 2,
    urgencyScore: 50,
    emails: [
      {
        id: "email-1",
        from: "sender@example.com",
        fromName: "Sender Name",
        subject: "Test Subject",
        body: "Test body content",
        htmlBody: null,
        receivedAt: new Date(),
      },
    ],
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AutoResponderService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            // save() is called when the autoresponder persists the sent email
            // with sentByAutoResponder=true (fixes #884).
            // findOne() is called to check for a sync-created duplicate before saving.
            // update() is called when a duplicate already exists.
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AutoResponseLog),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AutoResponseSuppression),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: EmailClassifierService,
          useValue: {
            classifyEmail: jest.fn(),
          },
        },
        {
          provide: QueueStatsService,
          useValue: {
            getQueueStats: jest.fn(),
            getResponseTimeForCategory: jest
              .fn()
              .mockImplementation((stats) => stats.avgResponseTime),
          },
        },
        {
          provide: AutoResponderTemplateService,
          useValue: {
            selectTemplate: jest
              .fn()
              .mockReturnValue("Test template {{userName}}"),
            getTemplateType: jest.fn().mockReturnValue("standard"),
            renderTemplate: jest.fn().mockImplementation((template, vars) => {
              let result = template;
              result = result.replace(
                /\{\{userName\}\}/g,
                vars.userName || "Test User",
              );
              result = result.replace(
                /\{\{actionCount\}\}/g,
                String(vars.actionCount || 0),
              );
              result = result.replace(
                /\{\{triageCount\}\}/g,
                String(vars.triageCount || 0),
              );
              result = result.replace(
                /\{\{avgResponseTime\}\}/g,
                vars.avgResponseTime || "",
              );
              result = result.replace(
                /\{\{urgentResponseTime\}\}/g,
                vars.urgentResponseTime || "",
              );
              return result;
            }),
            markdownToHtml: jest
              .fn()
              .mockImplementation(
                (text) => `<html><body><p>${text}</p></body></html>`,
              ),
          },
        },
        {
          provide: LLMService,
          useValue: {
            generateText: jest.fn(),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getPrimaryProvider: jest.fn(),
          },
        },
        {
          provide: AutoResponderSuppressionService,
          useValue: {
            hashEmail: jest.fn().mockImplementation((email) => `hash_${email}`),
            checkSuppression: jest.fn().mockResolvedValue(null),
            addCooldownSuppression: jest.fn().mockResolvedValue(undefined),
            addOptOutSuppression: jest.fn().mockResolvedValue(undefined),
            removeOptOutSuppression: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AutoResponderQaService,
          useValue: {
            generateQAAnswer: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AutoResponderContextService,
          useValue: {
            getUserContext: jest.fn().mockResolvedValue({
              vipContacts: [],
              qaPatterns: [],
            }),
            extractQAPatterns: jest.fn().mockResolvedValue([]),
            hashEmail: jest.fn().mockImplementation((email) => `hash_${email}`),
            checkSuppression: jest.fn().mockResolvedValue(null),
            classifyEmail: jest.fn().mockResolvedValue({
              type: "standard",
              confidence: 0.9,
              requiresResponse: false,
            }),
            checkCustomExclusionRules: jest.fn().mockResolvedValue({
              matched: false,
              matchedRule: null,
              reason: "No match",
            }),
            getQueueStats: jest.fn().mockResolvedValue({
              avgResponseTime: "2 hours",
              actionCount: 37,
              triageCount: 21,
            }),
            getResponseTimeForCategory: jest.fn().mockReturnValue("2 hours"),
            generateQAAnswer: jest.fn().mockResolvedValue(null),
            addCooldownSuppression: jest.fn().mockResolvedValue(undefined),
            addOptOutSuppression: jest.fn().mockResolvedValue(undefined),
            removeOptOutSuppression: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AutoResponderAnalyticsService,
          useValue: {
            logAutoResponse: jest.fn().mockResolvedValue(undefined),
            hasExistingResponse: jest.fn().mockResolvedValue(false),
            getAnalytics: jest.fn().mockResolvedValue({
              totalResponses: 0,
              responsesByPriority: { low: 0, medium: 0, high: 0 },
              responsesByDay: [],
              avgQAConfidence: 0,
            }),
          },
        },
        {
          provide: AutoResponderPreviewService,
          useValue: {
            determinePriorityLevel: jest.fn().mockReturnValue("medium"),
            previewAutoResponse: jest.fn().mockResolvedValue({
              subject: "Auto-Response: Acknowledgment of Your Email",
              body: "Hi there,\n\nThank you for reaching out. I'm currently managing 37 action items and 21 new messages. Test User will get back to you shortly.",
            }),
            previewAutoResponseForEmail: jest.fn().mockResolvedValue({
              subject: "Re: Test",
              body: "Preview body",
            }),
            getRecentEmailsForPreview: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<AutoResponderService>(AutoResponderService);
    userRepository = module.get(getRepositoryToken(User));
    emailThreadRepository = module.get(getRepositoryToken(EmailThread));
    autoResponseLogRepository = module.get(getRepositoryToken(AutoResponseLog));
    autoResponseSuppressionRepository = module.get(
      getRepositoryToken(AutoResponseSuppression),
    );
    emailClassifierService = module.get(EmailClassifierService);
    queueStatsService = module.get(QueueStatsService);
    emailProviderManager = module.get(EmailProviderManager);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getConfig", () => {
    it("should return default config when user has no settings", async () => {
      userRepository.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          autoResponderSettings: null,
        }),
      );

      const config = await service.getConfig("user-1");

      expect(config).toEqual(DEFAULT_AUTO_RESPONDER_CONFIG);
    });

    it("should return user's config when available", async () => {
      const customConfig = {
        ...DEFAULT_AUTO_RESPONDER_CONFIG,
        enabled: true,
        qaMinConfidence: 0.8,
      };
      userRepository.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          autoResponderSettings: customConfig,
        }),
      );

      const config = await service.getConfig("user-1");

      expect(config.enabled).toBe(true);
      expect(config.qaMinConfidence).toBe(0.8);
    });
  });

  describe("updateConfig", () => {
    it("should update user config", async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.update.mockResolvedValue(mockPartial({}));

      const config = await service.updateConfig("user-1", { enabled: true });

      expect(userRepository.update).toHaveBeenCalledWith("user-1", {
        autoResponderSettings: expect.objectContaining({ enabled: true }),
      });
      expect(config.enabled).toBe(true);
    });
  });

  describe("processEmailForAutoResponse", () => {
    beforeEach(() => {
      userRepository.findOne.mockResolvedValue(mockUser);
      emailThreadRepository.findOne.mockResolvedValue(mockThread);
      autoResponseLogRepository.findOne.mockResolvedValue(null);
      autoResponseSuppressionRepository.findOne.mockResolvedValue(null);
      emailClassifierService.classifyEmail.mockResolvedValue({
        isAutomated: false,
        isNewsletter: false,
        isColdOutreach: false,
        isReply: false,
        isOutOfOffice: false,
        isBounce: false,
        personalizationScore: 0.7,
        urgencyLevel: "medium",
        reasons: [],
      });
      queueStatsService.getQueueStats.mockResolvedValue({
        actionCount: 37,
        triageCount: 21,
        avgResponseTime: "~4 days",
        urgentResponseTime: "12-24 hours",
      });
    });

    it("should not send when auto-responder is disabled", async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: false,
        },
      });

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("Auto-responder disabled");
    });

    it("should not send when email is automated and customExclusionRules includes an automated rule", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue(undefined),
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
          customExclusionRules: [
            "Emails from automated systems (e.g., no-reply addresses, system notifications)",
          ],
        },
      });
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);
      const contextService = module.get(AutoResponderContextService);
      jest.spyOn(contextService, "classifyEmail").mockResolvedValue({
        isAutomated: true,
        isNewsletter: false,
        isColdOutreach: false,
        isReply: false,
        isOutOfOffice: false,
        isBounce: false,
        personalizationScore: 0,
        urgencyLevel: "low",
        reasons: ["Automated email"],
      });
      // checkCustomExclusionRules should match via deterministic pre-check (no LLM needed)
      jest
        .spyOn(contextService, "checkCustomExclusionRules")
        .mockResolvedValue({
          matched: true,
          matchedRule:
            "Emails from automated systems (e.g., no-reply addresses, system notifications)",
          reason:
            "Email was classified as automated and user has an automated-email exclusion rule",
        });
      autoResponseLogRepository.save.mockResolvedValue(mockPartial({}));
      autoResponseSuppressionRepository.save.mockResolvedValue(mockPartial({}));

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toContain("Custom exclusion rule matched");
    });

    it("should not send when thread already has auto-response", async () => {
      const analyticsService = module.get(AutoResponderAnalyticsService);
      jest.spyOn(analyticsService, "hasExistingResponse").mockResolvedValue(
        mockPartial({
          id: "log-1",
          userId: "user-1",
          emailThreadId: "thread-1",
        }),
      );
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("Auto-response already sent to this thread");
    });

    it("should not send to suppressed senders", async () => {
      const contextService = module.get(AutoResponderContextService);
      jest.spyOn(contextService, "checkSuppression").mockResolvedValue(
        mockPartial({
          id: "suppression-1",
          reason: "opt_out",
        }),
      );
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toContain("Sender suppressed");
    });

    it("should send auto-response for valid email", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({
          messageId: "mock-msg-id",
          threadId: "thread-1",
        }),
      };
      const analyticsService = module.get(AutoResponderAnalyticsService);
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(true);
      expect(mockProvider.sendReply).toHaveBeenCalled();
      expect(analyticsService.logAutoResponse).toHaveBeenCalled();
    });

    it("should update sentByAutoResponder=true on existing email entity when sync created it first (issue #884)", async () => {
      // Race condition: Gmail/O365 sync creates the email entity before
      // persistAutoResponseRecord runs. The autoresponder must UPSERT rather
      // than inserting a duplicate so the flag is reliably set.
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({
          messageId: "mock-msg-id",
          threadId: "thread-1",
        }),
      };
      const emailRepository = module.get(getRepositoryToken(Email));
      emailRepository.findOne.mockResolvedValue({ id: "existing-email-id" });

      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.processEmailForAutoResponse("user-1", "thread-1");

      expect(emailRepository.findOne).toHaveBeenCalledWith({
        where: { messageId: "mock-msg-id", userId: "user-1" },
        select: { id: true },
      });
      expect(emailRepository.update).toHaveBeenCalledWith("existing-email-id", {
        sentByAutoResponder: true,
      });
      expect(emailRepository.save).not.toHaveBeenCalled();
    });

    it("should insert new email entity with sentByAutoResponder=true when no existing entity", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({
          messageId: "mock-msg-id",
          threadId: "thread-1",
        }),
      };
      const emailRepository = module.get(getRepositoryToken(Email));
      emailRepository.findOne.mockResolvedValue(null);

      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.processEmailForAutoResponse("user-1", "thread-1");

      expect(emailRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sentByAutoResponder: true }),
      );
      expect(emailRepository.update).not.toHaveBeenCalled();
    });

    it("should set lastAutoRespondedAt on thread after sending auto-response (issue #857 guard)", async () => {
      // Regression test: after sending an auto-reply, BearlyMail must stamp the thread
      // with lastAutoRespondedAt so that the Gmail sync job cannot silently archive it.
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue(undefined),
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);
      emailThreadRepository.update = jest.fn().mockResolvedValue({});

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(true);
      // Ensure lastAutoRespondedAt was set so sync cannot archive this thread
      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1" },
        expect.objectContaining({
          lastAutoRespondedAt: expect.any(Date),
        }),
      );
    });

    it("should not set lastAutoRespondedAt if auto-response was not sent", async () => {
      // If the auto-responder skips (disabled), it must not stamp lastAutoRespondedAt
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: false,
        },
      });
      emailThreadRepository.update = jest.fn().mockResolvedValue({});

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(emailThreadRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lastAutoRespondedAt: expect.any(Date) }),
      );
    });

    it("should not send auto-response for emails older than 24 hours", async () => {
      jest.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      jest.setSystemTime(now);

      const oldEmailThread = {
        ...mockThread,
        emails: [
          {
            id: "email-1",
            from: "sender@example.com",
            fromName: "Sender Name",
            subject: "Test Subject",
            body: "Test body content",
            htmlBody: null,
            // 25 hours ago
            receivedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
          },
        ],
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailThreadRepository.findOne.mockResolvedValue(oldEmailThread);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toContain("Email too old for auto-response");
      expect(result.reason).toContain("25 hours old");

      jest.useRealTimers();
    });

    it("should send auto-response for emails within 24 hours", async () => {
      jest.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      jest.setSystemTime(now);

      const recentEmailThread = {
        ...mockThread,
        emails: [
          {
            id: "email-1",
            from: "sender@example.com",
            fromName: "Sender Name",
            subject: "Test Subject",
            body: "Test body content",
            htmlBody: null,
            // 12 hours ago
            receivedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          },
        ],
      };
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({
          messageId: "mock-msg-id",
          threadId: "thread-1",
        }),
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      });
      emailThreadRepository.findOne.mockResolvedValue(recentEmailThread);
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(true);

      jest.useRealTimers();
    });
  });

  describe("addOptOutSuppression", () => {
    it("should add opt-out suppression via context service", async () => {
      const contextService = module.get(AutoResponderContextService);

      await service.addOptOutSuppression(
        "user-1",
        "sender@example.com",
        "User requested",
      );

      expect(contextService.addOptOutSuppression).toHaveBeenCalledWith(
        "user-1",
        "sender@example.com",
        "User requested",
      );
    });
  });

  describe("previewAutoResponse", () => {
    it("should generate preview with sample data", async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      queueStatsService.getQueueStats.mockResolvedValue({
        actionCount: 37,
        triageCount: 21,
        avgResponseTime: "~4 days",
        urgentResponseTime: "12-24 hours",
      });

      const preview = await service.previewAutoResponse("user-1", "standard");

      expect(preview.subject).toContain("Auto-Response");
      expect(preview.body).toContain("Test User");
      expect(preview.body).toContain("37");
    });
  });
});
