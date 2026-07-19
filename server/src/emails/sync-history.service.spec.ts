import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SyncHistoryLog } from "../database/entities/sync-history-log.entity";
import { SyncHistoryService } from "./sync-history.service";

describe("SyncHistoryService", () => {
  let service: SyncHistoryService;
  let repo: jest.Mocked<Repository<SyncHistoryLog>>;

  const mockCreate = jest.fn();
  const mockSave = jest.fn();
  const mockFind = jest.fn();
  const mockQuery = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncHistoryService,
        {
          provide: getRepositoryToken(SyncHistoryLog),
          useValue: {
            create: mockCreate,
            save: mockSave,
            find: mockFind,
            query: mockQuery,
          },
        },
      ],
    }).compile();

    service = module.get<SyncHistoryService>(SyncHistoryService);
    repo = module.get(getRepositoryToken(SyncHistoryLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("logSyncAttempt", () => {
    it("should create and save a sync history log", async () => {
      const now = new Date();
      const mockLog = {
        userId: "user-123",
        provider: "gmail",
        syncWindowStart: now,
        queries: ["in:inbox after:1234567890"],
        threadsFound: 5,
        durationMs: 1200,
        errorMessage: null,
        isContinuation: false,
        completedAt: expect.any(Date),
      };

      mockCreate.mockReturnValue(mockLog);
      mockSave.mockResolvedValue({ ...mockLog, id: "log-uuid" });
      mockQuery.mockResolvedValue(undefined);

      await service.logSyncAttempt({
        userId: "user-123",
        provider: "gmail",
        syncWindowStart: now,
        queries: ["in:inbox after:1234567890"],
        threadsFound: 5,
        durationMs: 1200,
        isContinuation: false,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          provider: "gmail",
          queries: ["in:inbox after:1234567890"],
          threadsFound: 5,
          durationMs: 1200,
          isContinuation: false,
          errorMessage: null,
        }),
      );
      expect(mockSave).toHaveBeenCalled();
    });

    it("should not throw if save fails (non-critical)", async () => {
      mockCreate.mockReturnValue({});
      mockSave.mockRejectedValue(new Error("DB error"));

      await expect(
        service.logSyncAttempt({
          userId: "user-123",
          provider: "gmail",
          syncWindowStart: null,
          queries: [],
          threadsFound: 0,
          durationMs: 0,
        }),
      ).resolves.not.toThrow();
    });

    it("should include errorMessage when provided", async () => {
      mockCreate.mockReturnValue({});
      mockSave.mockResolvedValue({});
      mockQuery.mockResolvedValue(undefined);

      await service.logSyncAttempt({
        userId: "user-123",
        provider: "gmail",
        syncWindowStart: null,
        queries: [],
        threadsFound: 0,
        durationMs: 500,
        errorMessage: "Token expired",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Token expired",
        }),
      );
    });
  });

  describe("getSyncHistory", () => {
    it("should return mapped sync history entries", async () => {
      const now = new Date();
      const mockLogs: SyncHistoryLog[] = [
        {
          id: "log-1",
          userId: "user-123",
          syncedAt: now,
          completedAt: now,
          provider: "gmail",
          syncWindowStart: now,
          queries: ["in:inbox after:1234567890", "is:starred in:inbox"],
          threadsFound: 10,
          durationMs: 2000,
          errorMessage: null,
          isContinuation: false,
        },
      ];

      mockFind.mockResolvedValue(mockLogs);

      const result = await service.getSyncHistory("user-123", 20);

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        order: { syncedAt: "DESC" },
        take: 20,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "log-1",
        provider: "gmail",
        queries: ["in:inbox after:1234567890", "is:starred in:inbox"],
        threadsFound: 10,
        durationMs: 2000,
        isContinuation: false,
      });
    });

    it("should use default limit of 20", async () => {
      mockFind.mockResolvedValue([]);

      await service.getSyncHistory("user-123");

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it("should return empty queries array when queries is null", async () => {
      const mockLogs: SyncHistoryLog[] = [
        {
          id: "log-1",
          userId: "user-123",
          syncedAt: new Date(),
          completedAt: null,
          provider: "gmail",
          syncWindowStart: null,
          queries: null,
          threadsFound: null,
          durationMs: null,
          errorMessage: null,
          isContinuation: true,
        },
      ];

      mockFind.mockResolvedValue(mockLogs);

      const result = await service.getSyncHistory("user-123");

      expect(result[0].queries).toEqual([]);
    });
  });
});
