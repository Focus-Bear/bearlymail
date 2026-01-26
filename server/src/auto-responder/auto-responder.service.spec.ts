import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { LLMService } from "../llm/llm.service";
import { User } from "../database/entities/user.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { DEFAULT_AUTO_RESPONDER_CONFIG } from "./types/auto-responder.types";

// Mock the EmailProviderManager to avoid importing problematic dependencies
jest.mock("../emails/email-provider-manager.service", () => ({
  EmailProviderManager: jest.fn().mockImplementation(() => ({
    getPrimaryProvider: jest.fn(),
  })),
}));

// Import after mocking
import { AutoResponderService } from "./auto-responder.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";

describe("AutoResponderService", () => {
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
    const module: TestingModule = await Test.createTestingModule({
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
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {},
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
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: null,
      } as any);

      const config = await service.getConfig("user-1");

      expect(config).toEqual(DEFAULT_AUTO_RESPONDER_CONFIG);
    });

    it("should return user's config when available", async () => {
      const customConfig = {
        ...DEFAULT_AUTO_RESPONDER_CONFIG,
        enabled: true,
        qaMinConfidence: 0.8,
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: customConfig,
      } as any);

      const config = await service.getConfig("user-1");

      expect(config.enabled).toBe(true);
      expect(config.qaMinConfidence).toBe(0.8);
    });
  });

  describe("updateConfig", () => {
    it("should update user config", async () => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
      userRepository.update.mockResolvedValue({} as any);

      const config = await service.updateConfig("user-1", { enabled: true });

      expect(userRepository.update).toHaveBeenCalledWith("user-1", {
        autoResponderSettings: expect.objectContaining({ enabled: true }),
      });
      expect(config.enabled).toBe(true);
    });
  });

  describe("processEmailForAutoResponse", () => {
    beforeEach(() => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
      emailThreadRepository.findOne.mockResolvedValue(mockThread as any);
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
      } as any);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("Auto-responder disabled");
    });

    it("should not send to automated emails when excluded", async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      } as any);
      emailClassifierService.classifyEmail.mockResolvedValue({
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

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("Automated email excluded");
    });

    it("should not send when thread already has auto-response", async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      } as any);
      autoResponseLogRepository.findOne.mockResolvedValue({
        id: "log-1",
      } as any);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("Auto-response already sent to this thread");
    });

    it("should not send to suppressed senders", async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      } as any);
      autoResponseSuppressionRepository.findOne.mockResolvedValue({
        id: "suppression-1",
        reason: "opt_out",
      } as any);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toContain("Sender suppressed");
    });

    it("should send auto-response for valid email", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue(undefined),
      };
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        autoResponderSettings: {
          ...DEFAULT_AUTO_RESPONDER_CONFIG,
          enabled: true,
        },
      } as any);
      emailProviderManager.getPrimaryProvider.mockResolvedValue(
        mockProvider as any,
      );
      autoResponseLogRepository.save.mockResolvedValue({} as any);
      autoResponseSuppressionRepository.save.mockResolvedValue({} as any);

      const result = await service.processEmailForAutoResponse(
        "user-1",
        "thread-1",
      );

      expect(result.sent).toBe(true);
      expect(mockProvider.sendReply).toHaveBeenCalled();
      expect(autoResponseLogRepository.save).toHaveBeenCalled();
    });
  });

  describe("addOptOutSuppression", () => {
    it("should add opt-out suppression", async () => {
      autoResponseSuppressionRepository.delete.mockResolvedValue({} as any);
      autoResponseSuppressionRepository.save.mockResolvedValue({} as any);

      await service.addOptOutSuppression(
        "user-1",
        "sender@example.com",
        "User requested",
      );

      expect(autoResponseSuppressionRepository.delete).toHaveBeenCalled();
      expect(autoResponseSuppressionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          reason: "opt_out",
          suppressUntil: null,
        }),
      );
    });
  });

  describe("previewAutoResponse", () => {
    it("should generate preview with sample data", async () => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
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
