import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { ScanEmail } from "../database/entities/scan-email.entity";
import { ScanEmailService } from "./scan-email.service";

describe("ScanEmailService", () => {
  let service: ScanEmailService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanEmailService,
        {
          provide: getRepositoryToken(ScanEmail),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ScanEmailService>(ScanEmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createScanEmail", () => {
    it("should create and save a new scan email", async () => {
      const userId = "user-123";
      const emailData = {
        messageId: "msg-123",
        subject: "Test Email",
        from: "test@example.com",
      };
      const mockScanEmail = {
        id: "scan-1",
        userId,
        ...emailData,
        receivedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockScanEmail);
      mockRepository.save.mockResolvedValue(mockScanEmail);

      const result = await service.createScanEmail(userId, emailData);

      expect(result).toEqual(mockScanEmail);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...emailData,
        userId,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockScanEmail);
    });
  });

  describe("findByMessageId", () => {
    it("should find scan email by message ID", async () => {
      const userId = "user-123";
      const messageId = "msg-123";
      const mockScanEmail = {
        id: "scan-1",
        userId,
        messageId,
        subject: "Test",
      };

      mockRepository.findOne.mockResolvedValue(mockScanEmail);

      const result = await service.findByMessageId(userId, messageId);

      expect(result).toEqual(mockScanEmail);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, messageId },
      });
    });

    it("should return null when not found", async () => {
      const userId = "user-123";
      const messageId = "msg-123";

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByMessageId(userId, messageId);

      expect(result).toBeNull();
    });
  });

  describe("findAllForUser", () => {
    it("should return all scan emails for user ordered by receivedAt DESC", async () => {
      const userId = "user-123";
      const mockScanEmails = [
        {
          id: "scan-1",
          userId,
          messageId: "msg-1",
          receivedAt: new Date("2024-01-02"),
        },
        {
          id: "scan-2",
          userId,
          messageId: "msg-2",
          receivedAt: new Date("2024-01-01"),
        },
      ];

      mockRepository.find.mockResolvedValue(mockScanEmails);

      const result = await service.findAllForUser(userId);

      expect(result).toEqual(mockScanEmails);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { receivedAt: "DESC" },
      });
    });

    it("should return empty array when no scan emails exist", async () => {
      const userId = "user-123";

      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAllForUser(userId);

      expect(result).toEqual([]);
    });
  });

  describe("deleteAllForUser", () => {
    it("should delete all scan emails for user", async () => {
      const userId = "user-123";

      mockRepository.delete.mockResolvedValue({ affected: 5 });

      await service.deleteAllForUser(userId);

      expect(mockRepository.delete).toHaveBeenCalledWith({ userId });
    });
  });

  describe("countForUser", () => {
    it("should return count of scan emails for user", async () => {
      const userId = "user-123";
      const count = 10;

      mockRepository.count.mockResolvedValue(count);

      const result = await service.countForUser(userId);

      expect(result).toBe(count);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it("should return 0 when no scan emails exist", async () => {
      const userId = "user-123";

      mockRepository.count.mockResolvedValue(0);

      const result = await service.countForUser(userId);

      expect(result).toBe(0);
    });
  });
});
