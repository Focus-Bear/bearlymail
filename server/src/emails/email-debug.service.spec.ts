import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailDebugService } from "./email-debug.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { SyncHistoryService } from "./sync-history.service";

describe("EmailDebugService", () => {
  let service: EmailDebugService;
  let mockEmailRepository: jest.Mocked<Repository<Email>>;
  let mockEmailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let mockUserContextRepository: jest.Mocked<Repository<UserContext>>;
  let mockProtoCategoryRepository: jest.Mocked<Repository<ProtoCategory>>;
  let mockGmailProvider: jest.Mocked<Partial<GmailProvider>>;
  let mockBlockedSendersService: jest.Mocked<Partial<BlockedSendersService>>;

  beforeEach(async () => {
    mockEmailRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<Email>>;

    mockEmailThreadRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    mockUserContextRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<UserContext>>;

    mockProtoCategoryRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<ProtoCategory>>;

    mockGmailProvider = {
      lookupByGmailUrlId: jest.fn(),
    };

    mockBlockedSendersService = {
      isSenderBlocked: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDebugService,
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
        {
          provide: getRepositoryToken(ProtoCategory),
          useValue: mockProtoCategoryRepository,
        },
        {
          provide: EmailProviderManager,
          useValue: { getPrimaryProvider: jest.fn() },
        },
        {
          provide: GmailProvider,
          useValue: mockGmailProvider,
        },
        {
          provide: "PG_BOSS",
          useValue: { send: jest.fn() },
        },
        {
          provide: BlockedSendersService,
          useValue: mockBlockedSendersService,
        },
        {
          provide: SyncHistoryService,
          useValue: {
            getSyncHistory: jest.fn().mockResolvedValue([]),
            logSyncAttempt: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<EmailDebugService>(EmailDebugService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("lookupByGmailUrl", () => {
    const userId = "user-123";
    const gmailUrl =
      "https://mail.google.com/mail/u/0/#inbox/FMfcgzQfBsphbPMHvCJWcFscclwTDqzk";
    const urlId = "FMfcgzQfBsphbPMHvCJWcFscclwTDqzk";

    it("should call Gmail API when URL ID is not found in DB", async () => {
      // DB lookups return not found
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);

      // Gmail API returns a result
      const gmailApiResponse = {
        messageId: "18a1234567890abc",
        threadId: "thread-hex-id-abc",
        subject: "Test Subject",
        from: "sender@example.com",
        receivedAt: new Date("2024-01-01"),
      };
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue(
        gmailApiResponse,
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(mockGmailProvider.lookupByGmailUrlId).toHaveBeenCalledWith(
        userId,
        urlId,
      );
      expect(result.gmailApiResult).toBeDefined();
      expect(result.gmailApiResult?.foundInGmailApi).toBe(true);
      expect(result.gmailApiResult?.apiThreadId).toBe("thread-hex-id-abc");
      expect(result.gmailApiResult?.subject).toBe("Test Subject");
    });

    it("should return the thread from DB after resolving via Gmail API", async () => {
      const resolvedThreadId = "thread-hex-id-abc";
      const mockThread = {
        id: "db-thread-uuid",
        threadId: resolvedThreadId,
        starCount: 0,
        isArchived: false,
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: false,
        snoozeUntil: null,
        priorityScore: null,
        updatedAt: new Date(),
        userId,
      } as EmailThread;

      // First two DB lookups (by message ID and by thread ID using URL ID) return not found
      // lookupByMessageId
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne
        // first lookupThread call (by urlId)
        .mockResolvedValueOnce(null)
        // second lookupThread call (by resolved threadId)
        .mockResolvedValueOnce(mockThread);

      // emails in thread
      mockEmailRepository.find.mockResolvedValue([]);

      const gmailApiResponse = {
        messageId: "18a1234567890abc",
        threadId: resolvedThreadId,
        subject: "Test Subject",
        from: "sender@example.com",
        receivedAt: new Date("2024-01-01"),
      };
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue(
        gmailApiResponse,
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(true);
      expect(result.threadId).toBe(resolvedThreadId);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(true);
    });

    it("should report thread exists in Gmail but not synced when not in DB", async () => {
      // All DB lookups return not found
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);

      const gmailApiResponse = {
        messageId: "18a1234567890abc",
        threadId: "thread-hex-id-abc",
        subject: "Important Email",
        from: "boss@example.com",
        receivedAt: new Date("2024-01-01"),
      };
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue(
        gmailApiResponse,
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(false);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(true);
      expect(result.reasons[0]).toContain("NOT synced to BearlyMail yet");
      expect(result.reasons[0]).toContain("Important Email");
    });

    it("should handle Gmail API returning null (URL ID not resolvable)", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(false);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(false);
      expect(result.reasons[0]).toContain(
        "not found in BearlyMail database or Gmail API",
      );
    });

    it("should handle Gmail API errors gracefully", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockRejectedValue(
        new Error("Gmail API error"),
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(false);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(false);
    });
  });

  describe("getCategoryDebugData", () => {
    const userId = "user-123";
    const emailId = "email-abc";

    it("should return email data, categories and user context", async () => {
      const mockEmail = {
        id: emailId,
        userId,
        emailThreadId: "thread-uuid-1",
        from: "sender@example.com",
        fromName: "Sender Name",
        senderJobTitle: "Engineer",
        subject: "Test email subject",
        body: "This is the email body",
      } as Email;

      const mockThread = {
        id: "thread-uuid-1",
        userId,
        category: "PR Bot Comments",
        categoryExplanation: "Automated PR comment from a bot",
      } as EmailThread;

      const mockContexts: UserContext[] = [
        {
          contextId: "ctx-1",
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: "PR Bot Comments - GitHub PR bot notifications",
        } as UserContext,
        {
          contextId: "ctx-2",
          userId,
          contextKey: ContextKey.URGENT,
          contextValue: "Production issues",
          explanation: "Anything breaking prod",
        } as UserContext,
        {
          contextId: "ctx-3",
          userId,
          contextKey: ContextKey.MY_GOALS,
          contextValue: "Ship feature X",
          priority: 1,
        } as UserContext,
      ];

      const mockProtoCategories: ProtoCategory[] = [
        {
          id: "proto-1",
          userId,
          name: "🤖 Bot Alerts",
          description: "Automated alerts from bots",
          emailCount: 3,
          isPromoted: false,
        } as ProtoCategory,
      ];

      mockEmailRepository.findOne.mockResolvedValue(mockEmail);
      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockUserContextRepository.find.mockResolvedValue(mockContexts);
      mockProtoCategoryRepository.find.mockResolvedValue(mockProtoCategories);

      const result = await service.getCategoryDebugData(userId, emailId);

      expect(result.email.from).toBe("sender@example.com");
      expect(result.email.fromName).toBe("Sender Name");
      expect(result.email.senderJobTitle).toBe("Engineer");
      expect(result.email.subject).toBe("Test email subject");
      expect(result.email.bodyPreview).toBeTruthy();

      expect(result.thread.category).toBe("PR Bot Comments");
      expect(result.thread.categoryExplanation).toBe(
        "Automated PR comment from a bot",
      );

      expect(result.emailCategories).toHaveLength(1);
      expect(result.emailCategories[0].name).toBe("PR Bot Comments");
      expect(result.emailCategories[0].description).toBe(
        "GitHub PR bot notifications",
      );

      expect(result.protoCategories).toHaveLength(1);
      expect(result.protoCategories[0].name).toBe("🤖 Bot Alerts");

      expect(result.userContext.urgentItems).toHaveLength(1);
      expect(result.userContext.urgentItems[0].value).toBe("Production issues");
      expect(result.userContext.urgentItems[0].explanation).toBe(
        "Anything breaking prod",
      );

      expect(result.userContext.goals).toHaveLength(1);
      expect(result.userContext.goals[0].value).toBe("Ship feature X");
      expect(result.userContext.goals[0].priority).toBe(1);
    });

    it("should throw when email is not found", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getCategoryDebugData(userId, emailId),
      ).rejects.toThrow(`Email ${emailId} not found for user ${userId}`);
    });

    it("should handle email with no thread", async () => {
      const mockEmail = {
        id: emailId,
        userId,
        emailThreadId: null,
        from: "sender@example.com",
        fromName: "Sender",
        senderJobTitle: "",
        subject: "Subject",
        body: "Body",
      } as unknown as Email;

      mockEmailRepository.findOne.mockResolvedValue(mockEmail);
      mockUserContextRepository.find.mockResolvedValue([]);
      mockProtoCategoryRepository.find.mockResolvedValue([]);

      const result = await service.getCategoryDebugData(userId, emailId);

      expect(result.thread.category).toBeNull();
      expect(result.thread.categoryExplanation).toBeNull();
      expect(result.emailCategories).toHaveLength(0);
      expect(result.protoCategories).toHaveLength(0);
    });
  });
});
