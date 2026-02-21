import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailDebugService } from "./email-debug.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";

describe("EmailDebugService", () => {
  let service: EmailDebugService;
  let mockEmailRepository: jest.Mocked<Repository<Email>>;
  let mockEmailThreadRepository: jest.Mocked<Repository<EmailThread>>;
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
      mockEmailRepository.findOne.mockResolvedValue(null); // lookupByMessageId
      mockEmailThreadRepository.findOne
        .mockResolvedValueOnce(null) // first lookupThread call (by urlId)
        .mockResolvedValueOnce(mockThread); // second lookupThread call (by resolved threadId)

      mockEmailRepository.find.mockResolvedValue([]); // emails in thread

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
});
