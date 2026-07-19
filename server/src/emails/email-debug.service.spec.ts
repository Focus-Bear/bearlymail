import { Test, TestingModule } from "@nestjs/testing";
import { DataSource, In, Repository } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { CategoryShortlistService } from "../llm/category-shortlist.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailDebugCategoryService } from "./email-debug-category.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";
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

    const mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Email) return mockEmailRepository;
        if (entity === EmailThread) return mockEmailThreadRepository;
        if (entity === UserContext) return mockUserContextRepository;
        if (entity === ProtoCategory) return mockProtoCategoryRepository;
        return {};
      }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDebugService,
        {
          provide: DataSource,
          useValue: mockDataSource,
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
        {
          provide: CategoryRulesService,
          useValue: {
            getDeterministicRulesDebug: jest.fn().mockResolvedValue({
              winningRule: null,
              evaluations: [],
            }),
          },
        },
        {
          provide: CategoryShortlistService,
          useValue: {
            isShortlistEnabled: jest.fn().mockReturnValue(false),
            getShortlist: jest.fn(),
          },
        },
        {
          provide: PriorityAnalysisService,
          useValue: {
            analyzePriority: jest.fn(),
          },
        },
        EmailDebugCategoryService,
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

    const emptyDiagnostics = {
      connectedEmail: null,
      idsTried: [],
      attempts: [],
    };

    it("should call Gmail API when URL ID is not found in DB", async () => {
      // DB lookups return not found
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);

      // Gmail API returns a result
      const gmailApiResponse = {
        hit: {
          messageId: "18a1234567890abc",
          threadId: "thread-hex-id-abc",
          subject: "Test Subject",
          from: "sender@example.com",
          receivedAt: new Date("2024-01-01"),
        },
        diagnostics: emptyDiagnostics,
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
        hit: {
          messageId: "18a1234567890abc",
          threadId: resolvedThreadId,
          subject: "Test Subject",
          from: "sender@example.com",
          receivedAt: new Date("2024-01-01"),
        },
        diagnostics: emptyDiagnostics,
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
        hit: {
          messageId: "18a1234567890abc",
          threadId: "thread-hex-id-abc",
          subject: "Important Email",
          from: "boss@example.com",
          receivedAt: new Date("2024-01-01"),
        },
        diagnostics: emptyDiagnostics,
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

    it("should handle Gmail API returning no hit (URL ID not resolvable)", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue({
        hit: null,
        diagnostics: emptyDiagnostics,
      });

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(false);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(false);
      expect(result.reasons[0]).toContain(
        "not found in BearlyMail database or via the Gmail API",
      );
    });

    it("should include the connected Gmail account email in the diagnostic reasons", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockResolvedValue({
        hit: null,
        diagnostics: {
          connectedEmail: "connected@example.com",
          idsTried: ["FMfcgzAbcDef", "14c7dc8334202cf3"],
          attempts: [
            {
              id: "FMfcgzAbcDef",
              kind: "message",
              success: false,
              errorCode: 400,
              errorMessage: "Invalid id value",
            },
            {
              id: "14c7dc8334202cf3",
              kind: "thread",
              success: false,
              errorCode: 404,
              errorMessage: "Not Found",
            },
          ],
        },
      });

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(
        result.reasons.some((reason) =>
          reason.includes("connected@example.com"),
        ),
      ).toBe(true);
      expect(result.reasons.some((reason) => reason.includes("/u/0/"))).toBe(
        true,
      );
      expect(result.gmailApiResult?.connectedEmail).toBe(
        "connected@example.com",
      );
      expect(result.gmailApiResult?.attempts.length).toBe(2);
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

    it("should surface a descriptive error when Gmail auth is unavailable", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      (mockGmailProvider.lookupByGmailUrlId as jest.Mock).mockRejectedValue(
        new Error("Gmail not connected for user user-123"),
      );

      const result = await service.lookupByGmailUrl(userId, gmailUrl);

      expect(result.found).toBe(false);
      expect(result.gmailApiResult?.foundInGmailApi).toBe(false);
      expect(result.gmailApiResult?.error).toContain("Gmail not connected");
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
        // UUID reference — category column removed (fixes #1293)
        categoryId: "ctx-1",
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
      // Thread timeline query (newest first; the service reverses to oldest-first).
      mockEmailRepository.find.mockResolvedValue([mockEmail]);
      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockUserContextRepository.find.mockResolvedValue(mockContexts);
      mockProtoCategoryRepository.find.mockResolvedValue(mockProtoCategories);

      const result = await service.getCategoryDebugData(userId, emailId);

      expect(result.email.from).toBe("sender@example.com");
      expect(result.email.fromName).toBe("Sender Name");
      expect(result.threadEmails).toHaveLength(1);
      expect(result.threadEmails[0]).toMatchObject({
        emailId,
        isDebugTarget: true,
        isLatest: true,
      });
      expect(result.email.senderJobTitle).toBe("Engineer");
      expect(result.email.subject).toBe("Test email subject");
      expect(result.email.bodyPreview).toBeTruthy();

      expect(result.thread.category).toBe("PR Bot Comments");
      expect(result.thread.categoryExplanation).toBe(
        "Automated PR comment from a bot",
      );

      expect(result.emailCategories).toHaveLength(1);
      expect(result.emailCategories[0].id).toBe("ctx-1");
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
      ).rejects.toThrow(`Email ${emailId} not found`);
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

  describe("debugStarredThreads", () => {
    const userId = "user-debug-starred";
    const threadId1 = "thread-aaa";
    const threadId2 = "thread-bbb";

    const makeQueryBuilderMock = () => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    beforeEach(() => {
      mockGmailProvider.getStarredInboxThreadIds = jest
        .fn()
        .mockResolvedValue([threadId1, threadId2]);
      /*
       * threadId1 is in inbox, threadId2 is archived in Gmail.
       * Used to verify isInGmailInbox and archiveStatusConflict logic.
       */
      mockGmailProvider.getInboxThreadIds = jest
        .fn()
        .mockResolvedValue([threadId1]);
    });

    it("should include isArchivedInDb, isInGmailInbox, syncStatus fields per thread", async () => {
      const dbThread = {
        id: "db-thread-1",
        threadId: threadId1,
        starCount: 3,
        isArchived: false,
        category: null,
        syncStatus: "synced",
        syncStatusUpdatedAt: new Date(),
        isBatched: false,
        batchReleaseAt: null,
      } as unknown as EmailThread;

      mockEmailThreadRepository.find
        .mockResolvedValueOnce([dbThread])
        .mockResolvedValueOnce([]);

      mockEmailRepository.createQueryBuilder.mockReturnValue(
        makeQueryBuilderMock(),
      );

      mockBlockedSendersService.isSenderBlocked = jest
        .fn()
        .mockResolvedValue(false);

      const result = await service.debugStarredThreads(userId);

      const foundThread = result.threads.find(
        (th) => th.threadId === threadId1,
      );
      expect(foundThread).toBeDefined();
      expect(foundThread?.isArchivedInDb).toBe(false);
      expect(foundThread?.isInGmailInbox).toBe(true);
      expect(foundThread?.syncStatus).toBe("synced");
      expect(foundThread?.hasUnsyncedChanges).toBe(false);
      expect(foundThread?.archiveStatusConflict).toBe(false);
    });

    it("should set archiveStatusConflict=true when archived in DB but Gmail says INBOX and syncStatus is synced", async () => {
      /*
       * Thread is archived in BearlyMail AND Gmail still shows it in inbox,
       * AND syncStatus is synced — this is a genuine conflict.
       */
      const archivedThread = {
        id: "db-thread-conflict",
        threadId: threadId1,
        starCount: 3,
        isArchived: true,
        category: null,
        syncStatus: "synced",
        syncStatusUpdatedAt: new Date(),
        isBatched: false,
        batchReleaseAt: null,
      } as unknown as EmailThread;

      mockEmailThreadRepository.find
        .mockResolvedValueOnce([archivedThread])
        .mockResolvedValueOnce([]);

      mockEmailRepository.createQueryBuilder.mockReturnValue(
        makeQueryBuilderMock(),
      );

      mockBlockedSendersService.isSenderBlocked = jest
        .fn()
        .mockResolvedValue(false);

      const result = await service.debugStarredThreads(userId);

      const conflictThread = result.threads.find(
        (th) => th.threadId === threadId1,
      );
      expect(conflictThread?.isArchivedInDb).toBe(true);
      expect(conflictThread?.isInGmailInbox).toBe(true);
      expect(conflictThread?.archiveStatusConflict).toBe(true);
      expect(result.summary.archiveConflicts).toBeGreaterThanOrEqual(1);
    });

    it("should NOT set archiveStatusConflict when archived with unsynced changes pending", async () => {
      /*
       * Thread is archived but syncStatus is 'unsynced' — the provider sync
       * has not completed yet, so there is no conflict to surface.
       */
      const unsyncedArchivedThread = {
        id: "db-thread-unsynced",
        threadId: threadId1,
        starCount: 3,
        isArchived: true,
        category: null,
        syncStatus: "unsynced",
        syncStatusUpdatedAt: new Date(),
        isBatched: false,
        batchReleaseAt: null,
      } as unknown as EmailThread;

      mockEmailThreadRepository.find
        .mockResolvedValueOnce([unsyncedArchivedThread])
        .mockResolvedValueOnce([]);

      mockEmailRepository.createQueryBuilder.mockReturnValue(
        makeQueryBuilderMock(),
      );

      mockBlockedSendersService.isSenderBlocked = jest
        .fn()
        .mockResolvedValue(false);

      const result = await service.debugStarredThreads(userId);

      const unsyncedThread = result.threads.find(
        (th) => th.threadId === threadId1,
      );
      expect(unsyncedThread?.hasUnsyncedChanges).toBe(true);
      expect(unsyncedThread?.archiveStatusConflict).toBe(false);
    });

    it("should include new summary fields archivedInBearlyMail and archiveConflicts", async () => {
      mockEmailThreadRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockEmailRepository.createQueryBuilder.mockReturnValue(
        makeQueryBuilderMock(),
      );

      const result = await service.debugStarredThreads(userId);

      expect(result.summary).toHaveProperty("archivedInBearlyMail");
      expect(result.summary).toHaveProperty("archiveConflicts");
    });
  });

  describe("fixStaleUnsyncedThreads", () => {
    const userId = "user-fix-stale";

    it("should reconcile isArchived with Gmail inbox status before marking synced", async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      /*
       * Thread was archived in BearlyMail but Gmail reports it is still in
       * inbox — fixStaleUnsyncedThreads should set isArchived=false to match.
       */
      const staleThread = {
        id: "stale-1",
        threadId: "stale-thread-aaa",
        syncStatusUpdatedAt: sixMinutesAgo,
        isArchived: true,
      } as unknown as EmailThread;

      mockEmailThreadRepository.find.mockResolvedValue([staleThread]);
      mockEmailThreadRepository.update = jest
        .fn()
        .mockResolvedValue({ affected: 1 });

      /*
       * Gmail reports the thread as in-inbox, so shouldBeArchived resolves
       * to false.
       */
      mockGmailProvider.getInboxThreadIds = jest
        .fn()
        .mockResolvedValue(["stale-thread-aaa"]);

      const result = await service.fixStaleUnsyncedThreads(userId);

      expect(result.fixed).toBe(1);
      // Batched update: thread is in Gmail inbox → goes to toMarkUnarchived batch
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: In(["stale-1"]) },
        expect.objectContaining({
          isArchived: false,
          syncStatus: "synced",
        }),
      );
    });

    it("should fall back to existing isArchived when Gmail fetch fails", async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const staleThread = {
        id: "stale-2",
        threadId: "stale-thread-bbb",
        syncStatusUpdatedAt: sixMinutesAgo,
        isArchived: true,
      } as unknown as EmailThread;

      mockEmailThreadRepository.find.mockResolvedValue([staleThread]);
      mockEmailThreadRepository.update = jest
        .fn()
        .mockResolvedValue({ affected: 1 });

      mockGmailProvider.getInboxThreadIds = jest
        .fn()
        .mockRejectedValue(new Error("Gmail auth expired"));

      const result = await service.fixStaleUnsyncedThreads(userId);

      expect(result.fixed).toBe(1);
      /*
       * When Gmail is unavailable, isArchived must be preserved as-is rather
       * than blindly reset to false. Thread.isArchived=true → goes to
       * toMarkArchived batch (batched update, not N individual writes).
       */
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: In(["stale-2"]) },
        expect.objectContaining({
          isArchived: true,
          syncStatus: "synced",
        }),
      );
    });

    it("should return zero fixed when no stale threads found", async () => {
      mockEmailThreadRepository.find.mockResolvedValue([]);

      const result = await service.fixStaleUnsyncedThreads(userId);

      expect(result.fixed).toBe(0);
      expect(result.threadIds).toHaveLength(0);
    });
  });
});
