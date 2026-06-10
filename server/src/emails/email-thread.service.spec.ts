import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailThreadService } from "./email-thread.service";

describe("EmailThreadService", () => {
  let service: EmailThreadService;

  const mockEmailThreadRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEmailRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailThreadService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
      ],
    }).compile();

    service = module.get<EmailThreadService>(EmailThreadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getThreadEmails", () => {
    it("should return emails in thread sorted by receivedAt ASC", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const mockEmails = [
        {
          id: "email-2",
          threadId,
          receivedAt: new Date("2024-01-01"),
        },
        {
          id: "email-1",
          threadId,
          receivedAt: new Date("2024-01-02"),
        },
      ];

      mockEmailRepository.find.mockResolvedValue(mockEmails);

      const result = await service.getThreadEmails(userId, threadId);

      expect(result).toEqual(mockEmails);
      expect(mockEmailRepository.find).toHaveBeenCalledWith({
        where: { userId, threadId },
        order: { receivedAt: "ASC" },
      });
    });

    it("should use DESC order and take when options are passed", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      mockEmailRepository.find.mockResolvedValue([]);

      await service.getThreadEmails(userId, threadId, {
        order: "DESC",
        limit: 10,
      });

      expect(mockEmailRepository.find).toHaveBeenCalledWith({
        where: { userId, threadId },
        order: { receivedAt: "DESC" },
        take: 10,
      });
    });
  });

  describe("getRecentNonArchivedThreadIds", () => {
    it("should return recent non-archived thread IDs", async () => {
      const userId = "user-123";
      const days = 7;
      const mockResults = [{ threadId: "thread-1" }, { threadId: "thread-2" }];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockResults),
      };

      mockEmailThreadRepository.createQueryBuilder.mockReturnValue(
        queryBuilder,
      );

      const result = await service.getRecentNonArchivedThreadIds(userId, days);

      expect(result).toEqual(["thread-1", "thread-2"]);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        "thread.userId = :userId",
        { userId },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "thread.isArchived = false",
      );
      expect(queryBuilder.limit).toHaveBeenCalledWith(
        QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
      );
    });

    it("should filter out null/undefined thread IDs", async () => {
      const userId = "user-123";
      const mockResults = [
        { threadId: "thread-1" },
        { threadId: null },
        { threadId: "thread-2" },
        { threadId: undefined },
      ];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockResults),
      };

      mockEmailThreadRepository.createQueryBuilder.mockReturnValue(
        queryBuilder,
      );

      const result = await service.getRecentNonArchivedThreadIds(userId);

      expect(result).toEqual(["thread-1", "thread-2"]);
    });

    it("should use default days value of 7", async () => {
      const userId = "user-123";
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockEmailThreadRepository.createQueryBuilder.mockReturnValue(
        queryBuilder,
      );

      await service.getRecentNonArchivedThreadIds(userId);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "email.receivedAt >= :cutoffDate",
        expect.objectContaining({
          cutoffDate: expect.any(Date),
        }),
      );
    });
  });

  describe("getAllNonArchivedThreadIds", () => {
    it("should return all non-archived thread IDs", async () => {
      const userId = "user-123";
      const mockThreads = [
        { threadId: "thread-1" },
        { threadId: "thread-2" },
        { threadId: "thread-3" },
      ];

      mockEmailThreadRepository.find.mockResolvedValue(mockThreads);

      const result = await service.getAllNonArchivedThreadIds(userId);

      expect(result).toEqual(["thread-1", "thread-2", "thread-3"]);
      expect(mockEmailThreadRepository.find).toHaveBeenCalledWith({
        where: { userId, isArchived: false },
        select: { threadId: true },
      });
    });

    it("should return empty array when no threads found", async () => {
      const userId = "user-123";

      mockEmailThreadRepository.find.mockResolvedValue([]);

      const result = await service.getAllNonArchivedThreadIds(userId);

      expect(result).toEqual([]);
    });
  });

  describe("getAllThreadsForSync", () => {
    it("should return all threads with threadId, isArchived, and starCount", async () => {
      const userId = "user-123";
      const mockThreads = [
        {
          threadId: "thread-1",
          isArchived: false,
          starCount: 2,
        },
        {
          threadId: "thread-2",
          isArchived: true,
          starCount: 0,
        },
      ];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockThreads),
      };

      mockEmailThreadRepository.createQueryBuilder.mockReturnValue(
        queryBuilder,
      );

      const result = await service.getAllThreadsForSync(userId);

      expect(result).toEqual([
        { threadId: "thread-1", isArchived: false, starCount: 2 },
        { threadId: "thread-2", isArchived: true, starCount: 0 },
      ]);
      expect(queryBuilder.limit).toHaveBeenCalledWith(500);
    });

    it("should filter out null/undefined threadIds", async () => {
      const userId = "user-123";
      const mockThreads = [
        { threadId: "thread-1", isArchived: false, starCount: 0 },
        { threadId: null, isArchived: false, starCount: 0 },
        { threadId: "thread-2", isArchived: true, starCount: 1 },
      ];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockThreads),
      };

      mockEmailThreadRepository.createQueryBuilder.mockReturnValue(
        queryBuilder,
      );

      const result = await service.getAllThreadsForSync(userId);

      expect(result).toEqual([
        { threadId: "thread-1", isArchived: false, starCount: 0 },
        { threadId: "thread-2", isArchived: true, starCount: 1 },
      ]);
    });
  });

  describe("getOrCreateEmailThread", () => {
    it("should create a new thread when one does not exist", async () => {
      const userId = "user-123";
      const threadId = "thread-new";
      const newThread = {
        id: "uuid-1",
        userId,
        threadId,
        starCount: 0,
        isArchived: false,
        lastUserOperationAt: null,
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(null);
      mockEmailThreadRepository.create.mockReturnValue(newThread);
      mockEmailThreadRepository.save.mockResolvedValue(newThread);

      const result = await service.getOrCreateEmailThread(
        userId,
        threadId,
        0,
        false,
      );

      expect(result).toEqual(newThread);
      expect(mockEmailThreadRepository.create).toHaveBeenCalledWith({
        userId,
        threadId,
        starCount: 0,
        isArchived: false,
      });
    });

    it("should preserve starCount when new email arrives and provider says starred (follow-up bug fix)", async () => {
      // Core bug scenario:
      // 1. User sets starCount=1 in BearlyMail → star synced to Gmail (STARRED label)
      // 2. New email arrives in thread → lastUserOperationAt cleared, shouldClearUserOperation=true
      // 3. Sync runs, Gmail sees STARRED label → provider returns starCount=3
      // 4. Bug (old code): starCount overwritten to 3 (provider value), losing user's level-1 setting
      // Fix: when provider says "starred" (starCount > 0), preserve BearlyMail's granular value
      // because Gmail only knows binary starred/not-starred (not 1/2/3 distinction)
      const userId = "user-123";
      const threadId = "thread-with-follow-up";
      const existingThread = {
        id: "uuid-1",
        userId,
        threadId,
        // User's specific follow-up priority level
        starCount: 1,
        isArchived: false,
        // Set by user action
        lastUserOperationAt: new Date(),
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(existingThread);
      mockEmailThreadRepository.save.mockImplementation((thread) =>
        Promise.resolve({ ...thread }),
      );

      // Sync calls getOrCreateEmailThread with starCount=3 from provider
      // (Gmail sees STARRED label and maps to starCount=3)
      const result = await service.getOrCreateEmailThread(
        userId,
        threadId,
        // Provider says "starred" (Gmail maps STARRED label to 3)
        3,
        false,
      );

      // starCount should be preserved at 1 (user's specific priority level)
      expect(result.starCount).toBe(1);
      // lastUserOperationAt should be cleared (so future syncs can update the thread)
      expect(result.lastUserOperationAt).toBeNull();

      // Verify save was called with preserved starCount
      const savedThread = mockEmailThreadRepository.save.mock.calls[0][0];
      expect(savedThread.starCount).toBe(1);
      expect(savedThread.lastUserOperationAt).toBeNull();
    });

    it("should preserve starCount when new email arrives even if provider says not starred (follow-up triage bug fix)", async () => {
      // Core bug scenario (the actual user report):
      // 1. User replies to email from triage and selects "follow up in 48hrs"
      // 2. This sets starCount=1 (follow-up level) and syncs STARRED label to Gmail
      // 3. Other person replies → new email arrives → lastUserOperationAt cleared
      // 4. Gmail sync determines starCount from latest message's labels
      // 5. But the latest message (incoming reply) doesn't have STARRED label!
      // 6. Bug (old code): provider says starCount=0, BearlyMail overwrote to 0 → thread in triage
      // Fix: ALWAYS preserve existing starCount when shouldClearUserOperation is true
      const userId = "user-123";
      const threadId = "thread-follow-up-reply";
      const existingThread = {
        id: "uuid-1",
        userId,
        threadId,
        // User's follow-up level from reply action
        starCount: 1,
        isArchived: false,
        // Set by snooze/follow-up action
        lastUserOperationAt: new Date(),
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(existingThread);
      mockEmailThreadRepository.save.mockImplementation((thread) =>
        Promise.resolve({ ...thread }),
      );

      // Sync calls getOrCreateEmailThread with starCount=0 because:
      // - Gmail determines starCount from latest message
      // - The latest message is the incoming reply
      // - Incoming replies don't have STARRED label
      const result = await service.getOrCreateEmailThread(
        userId,
        threadId,
        // Provider says "not starred" (latest message doesn't have STARRED)
        0,
        false,
      );

      // starCount should be PRESERVED at 1 (user's follow-up level)
      // This ensures the thread stays in action/follow-up mode, not triage
      expect(result.starCount).toBe(1);
      expect(result.lastUserOperationAt).toBeNull();
    });

    it("should update starCount from provider when no lastUserOperationAt is set", async () => {
      // Normal sync scenario: thread has no user operation protection
      const userId = "user-123";
      const threadId = "thread-normal";
      const existingThread = {
        id: "uuid-1",
        userId,
        threadId,
        starCount: 0,
        isArchived: false,
        // No user protection
        lastUserOperationAt: null,
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(existingThread);
      mockEmailThreadRepository.save.mockImplementation((thread) =>
        Promise.resolve({ ...thread }),
      );

      // Provider says thread is now starred (starCount=3, the value Gmail sync returns)
      const result = await service.getOrCreateEmailThread(
        userId,
        threadId,
        3,
        false,
      );

      // starCount should be updated from provider (3)
      expect(result.starCount).toBe(3);
    });

    it("should not call save when thread is already up to date", async () => {
      const userId = "user-123";
      const threadId = "thread-unchanged";
      const existingThread = {
        id: "uuid-1",
        userId,
        threadId,
        starCount: 0,
        isArchived: false,
        // No user protection, no changes needed
        lastUserOperationAt: null,
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(existingThread);

      await service.getOrCreateEmailThread(userId, threadId, 0, false);

      // No changes, save should not be called
      expect(mockEmailThreadRepository.save).not.toHaveBeenCalled();
    });
  });
});
