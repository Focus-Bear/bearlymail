import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EmailThreadService } from "./email-thread.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { QUERY_LIMITS } from "../constants/query-limits";

describe("EmailThreadService", () => {
  let service: EmailThreadService;

  const mockEmailThreadRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEmailRepository = {
    createQueryBuilder: jest.fn(),
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
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEmails),
      };

      mockEmailRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.getThreadEmails(userId, threadId);

      expect(result).toEqual(mockEmails);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        "email.userId = :userId",
        { userId },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "email.threadId = :threadId",
        { threadId },
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        "email.receivedAt",
        "ASC",
      );
    });

    it("should select specific fields to avoid decrypting large fields", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockEmailRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.getThreadEmails(userId, threadId);

      expect(queryBuilder.select).toHaveBeenCalledWith(
        expect.arrayContaining([
          "email.id",
          "email.userId",
          "email.threadId",
          "email.subject",
          "email.from",
          "email.receivedAt",
        ]),
      );
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
        select: ["threadId"],
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
});
