import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { BlockedSendersService } from "./blocked-senders.service";

describe("BlockedSendersService", () => {
  let service: BlockedSendersService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockedSendersService,
        {
          provide: getRepositoryToken(BlockedSender),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<BlockedSendersService>(BlockedSendersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("blockSender", () => {
    it("should create a new blocked sender", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const senderName = "Spam Sender";
      const reason = "Unwanted emails";

      const emailHash = SearchIndexHelper.hashExact(email);
      const mockBlocked = {
        id: "blocked-1",
        userId,
        email,
        emailHash,
        senderName,
        reason,
        blockedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockBlocked);
      mockRepository.save.mockResolvedValue(mockBlocked);

      const result = await service.blockSender(
        userId,
        email,
        senderName,
        reason,
      );

      expect(result).toEqual(mockBlocked);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, emailHash },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        email,
        emailHash,
        domainHash: null,
        senderName,
        reason,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockBlocked);
    });

    it("should update existing blocked sender", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);
      const existingBlocked = {
        id: "blocked-1",
        userId,
        email,
        emailHash,
        senderName: "Old Name",
        reason: "Old reason",
        blockedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(existingBlocked);
      mockRepository.save.mockResolvedValue({
        ...existingBlocked,
        senderName: "New Name",
        reason: "New reason",
      });

      const result = await service.blockSender(
        userId,
        email,
        "New Name",
        "New reason",
      );

      expect(result.senderName).toBe("New Name");
      expect(result.reason).toBe("New reason");
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("should block domain when blockDomain is true", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);
      const domainHash = SearchIndexHelper.hashExact("example.com");
      const mockBlocked = {
        id: "blocked-1",
        userId,
        email,
        emailHash,
        domainHash,
        blockedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockBlocked);
      mockRepository.save.mockResolvedValue(mockBlocked);

      const result = await service.blockSender(
        userId,
        email,
        undefined,
        undefined,
        true,
      );

      expect(result.domainHash).toBe(domainHash);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          domainHash,
        }),
      );
    });
  });

  describe("unblockSender", () => {
    it("should delete blocked sender by ID", async () => {
      const userId = "user-123";
      const blockedSenderId = "blocked-1";

      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.unblockSender(userId, blockedSenderId);

      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: blockedSenderId,
        userId,
      });
    });
  });

  describe("unblockByEmail", () => {
    it("should delete blocked sender by email", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);

      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.unblockByEmail(userId, email);

      expect(mockRepository.delete).toHaveBeenCalledWith({
        userId,
        emailHash,
      });
    });
  });

  describe("getBlockedSenders", () => {
    it("should return all blocked senders for user", async () => {
      const userId = "user-123";
      const mockBlocked = [
        {
          id: "blocked-1",
          userId,
          email: "spam1@example.com",
          senderName: "Spam 1",
          reason: "Reason 1",
          blockedAt: new Date("2024-01-01"),
        },
        {
          id: "blocked-2",
          userId,
          email: "spam2@example.com",
          senderName: "Spam 2",
          reason: "Reason 2",
          blockedAt: new Date("2024-01-02"),
        },
      ];

      mockRepository.find.mockResolvedValue(mockBlocked);

      const result = await service.getBlockedSenders(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "blocked-1",
        email: "spam1@example.com",
        senderName: "Spam 1",
        reason: "Reason 1",
        blockedAt: mockBlocked[0].blockedAt,
      });
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { blockedAt: "DESC" },
      });
    });
  });

  describe("isSenderBlocked", () => {
    it("should return true if email is blocked", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);

      mockRepository.find.mockResolvedValue([{ emailHash, domainHash: null }]);

      const result = await service.isSenderBlocked(userId, email);

      expect(result).toBe(true);
    });

    it("should return true if domain is blocked", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const domainHash = SearchIndexHelper.hashExact("example.com");

      mockRepository.find.mockResolvedValue([
        { emailHash: "other-hash", domainHash },
      ]);

      const result = await service.isSenderBlocked(userId, email);

      expect(result).toBe(true);
    });

    it("should return false if sender is not blocked", async () => {
      const userId = "user-123";
      const email = "good@example.com";

      mockRepository.find.mockResolvedValue([]);

      const result = await service.isSenderBlocked(userId, email);

      expect(result).toBe(false);
    });

    it("should return false when email is null or empty (no crash)", async () => {
      const userId = "user-123";
      mockRepository.find.mockResolvedValue([]);

      await expect(
        service.isSenderBlocked(userId, "" as unknown as string),
      ).resolves.toBe(false);
      await expect(
        service.isSenderBlocked(userId, null as unknown as string),
      ).resolves.toBe(false);
    });

    it("should use cache on subsequent calls", async () => {
      const userId = "user-123";
      const email = "spam@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);

      mockRepository.find.mockResolvedValueOnce([
        { emailHash, domainHash: null },
      ]);

      const result1 = await service.isSenderBlocked(userId, email);
      const result2 = await service.isSenderBlocked(userId, email);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe("getBlockedEmailHashes", () => {
    it("should return array of blocked email hashes", async () => {
      const userId = "user-123";
      const emailHash1 = "hash1";
      const emailHash2 = "hash2";

      mockRepository.find.mockResolvedValue([
        { emailHash: emailHash1, domainHash: null },
        { emailHash: emailHash2, domainHash: null },
      ]);

      const result = await service.getBlockedEmailHashes(userId);

      expect(result).toEqual([emailHash1, emailHash2]);
    });

    it("should return empty array when no blocked senders", async () => {
      const userId = "user-123";

      mockRepository.find.mockResolvedValue([]);

      const result = await service.getBlockedEmailHashes(userId);

      expect(result).toEqual([]);
    });
  });

  describe("filterBlockedEmails", () => {
    it("should filter out blocked emails", async () => {
      const userId = "user-123";
      const emails = [
        { id: "email-1", from: "spam@example.com" },
        { id: "email-2", from: "good@example.com" },
        { id: "email-3", from: "another@blocked.com" },
      ];
      const spamHash = SearchIndexHelper.hashExact("spam@example.com");
      const blockedDomainHash = SearchIndexHelper.hashExact("blocked.com");

      mockRepository.find.mockResolvedValue([
        { emailHash: spamHash, domainHash: null },
        { emailHash: "other", domainHash: blockedDomainHash },
      ]);

      const result = await service.filterBlockedEmails(userId, emails);

      expect(result).toEqual(["email-1", "email-3"]);
    });

    it("should return empty array when no emails are blocked", async () => {
      const userId = "user-123";
      const emails = [
        { id: "email-1", from: "good@example.com" },
        { id: "email-2", from: "another@example.com" },
      ];

      mockRepository.find.mockResolvedValue([]);

      const result = await service.filterBlockedEmails(userId, emails);

      expect(result).toEqual([]);
    });

    it("should skip entries with null or undefined from without throwing", async () => {
      const userId = "user-123";
      const emails = [
        { id: "email-1", from: null as unknown as string },
        { id: "email-2", from: "good@example.com" },
      ];

      mockRepository.find.mockResolvedValue([]);

      const result = await service.filterBlockedEmails(userId, emails);

      expect(result).toEqual([]);
    });
  });
});
