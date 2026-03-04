import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { User } from "../database/entities/user.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { ExportedUserData } from "./data-export.service";
import { DataImportService } from "./data-import.service";

describe("DataImportService", () => {
  let service: DataImportService;

  const mockUserRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockUserContextRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockBatchScheduleRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockBlockedSenderRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockBlockedKeywordRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockSummarizationRuleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImportService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
        {
          provide: getRepositoryToken(BatchSchedule),
          useValue: mockBatchScheduleRepository,
        },
        {
          provide: getRepositoryToken(BlockedSender),
          useValue: mockBlockedSenderRepository,
        },
        {
          provide: getRepositoryToken(BlockedKeyword),
          useValue: mockBlockedKeywordRepository,
        },
        {
          provide: getRepositoryToken(SummarizationRule),
          useValue: mockSummarizationRuleRepository,
        },
      ],
    }).compile();

    service = module.get<DataImportService>(DataImportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("importUserData", () => {
    const userId = "user-123";

    const validImportData: ExportedUserData = {
      exportedAt: "2024-01-01T00:00:00.000Z",
      version: "1.0",
      profile: {
        displayName: "Test User",
        jobTitle: "Developer",
      },
      batchSchedule: {
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "America/New_York",
        isEnabled: true,
        urgentBypassSchedule: true,
      },
      blockedSenders: [
        {
          email: "spam@example.com",
          senderName: "Spam Sender",
          reason: "Unwanted emails",
          blockedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      blockedKeywords: [
        {
          keyword: "unsubscribe",
          exactMatch: false,
          reason: "Newsletter",
          blockedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      contexts: [
        {
          contextKey: "VIP_CONTACT",
          contextValue: "boss@company.com",
          priority: 1,
          source: "USER_EDITED",
          explanation: "My manager",
        },
      ],
      toneRules: ["Be concise", "Use professional language"],
      summarizationRules: [
        {
          whenToUse: "For newsletters",
          howToSummarize: "Extract key points only",
        },
      ],
      autoResponderSettings: {
        enabled: true,
        sendFor: {
          standardPriority: true,
          highPriority: false,
          lowPriority: false,
        },
        customExclusionRules: [],
        templates: {
          standard: "Standard template",
          highPriority: "High priority template",
          lowPriority: "Low priority template",
          noAnswer: "No answer template",
          zeroBacklog: "Zero backlog template",
        },
        qaContextEnabled: true,
        qaMinConfidence: 0.7,
        maxAutoResponsesPerSender: 1,
        cooldownPeriodDays: 7,
      },
      integrations: {
        hasOpenAiApiKey: false,
        hasGithubToken: false,
      },
    };

    it("should throw BadRequestException for invalid data", async () => {
      await expect(service.importUserData(userId, null)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.importUserData(userId, "string")).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.importUserData(userId, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for missing version", async () => {
      await expect(
        service.importUserData(userId, { exportedAt: "2024-01-01" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for incompatible version", async () => {
      await expect(
        service.importUserData(userId, {
          version: "2.0",
          exportedAt: "2024-01-01",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if user does not exist", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.importUserData(userId, validImportData),
      ).rejects.toThrow(NotFoundException);
    });

    it("should import profile data", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.profile).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
        displayName: "Test User",
        jobTitle: "Developer",
      });
    });

    it("should import batch schedule when none exists", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.batchSchedule).toBe(true);
      expect(mockBatchScheduleRepository.save).toHaveBeenCalled();
    });

    it("should update existing batch schedule", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue({
        id: "schedule-123",
        userId,
      });
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.batchSchedule).toBe(true);
      expect(mockBatchScheduleRepository.update).toHaveBeenCalled();
    });

    it("should import blocked senders", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.blockedSenders).toBe(1);
      expect(mockBlockedSenderRepository.save).toHaveBeenCalled();
    });

    it("should skip duplicate blocked senders in merge mode", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue({
        id: "existing",
      });
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.blockedSenders).toBe(0);
      expect(result.skipped.blockedSenders).toBe(1);
    });

    it("should delete existing data in replace mode", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      await service.importUserData(userId, validImportData, {
        mergeMode: "replace",
        sections: {
          blockedSenders: true,
          blockedKeywords: true,
          contexts: true,
          summarizationRules: true,
        },
      });

      expect(mockBlockedSenderRepository.delete).toHaveBeenCalledWith({
        userId,
      });
      expect(mockBlockedKeywordRepository.delete).toHaveBeenCalledWith({
        userId,
      });
      expect(mockUserContextRepository.delete).toHaveBeenCalledWith({
        userId,
      });
      expect(mockSummarizationRuleRepository.delete).toHaveBeenCalledWith({
        userId,
      });
    });

    it("should import contexts", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.contexts).toBe(1);
      expect(mockUserContextRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          contextKey: ContextKey.VIP_CONTACT,
          contextValue: "boss@company.com",
          source: Source.USER_EDITED,
        }),
      );
    });

    it("should skip invalid context keys", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const dataWithInvalidContext = {
        ...validImportData,
        contexts: [
          {
            contextKey: "INVALID_KEY",
            contextValue: "test",
            source: "USER_EDITED",
          },
        ],
      };

      const result = await service.importUserData(
        userId,
        dataWithInvalidContext,
      );

      expect(result.success).toBe(true);
      expect(result.imported.contexts).toBe(0);
      expect(result.skipped.contexts).toBe(1);
    });

    it("should import tone rules", async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        toneSettings: { rules: [] },
      });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.toneRules).toBe(2);
    });

    it("should merge tone rules without duplicates", async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        toneSettings: { rules: ["Be concise", "Existing rule"] },
      });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      await service.importUserData(userId, validImportData, {
        mergeMode: "merge",
        sections: { toneRules: true },
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
        toneSettings: {
          rules: expect.arrayContaining([
            "Be concise",
            "Use professional language",
            "Existing rule",
          ]),
        },
      });
    });

    it("should import summarization rules", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.summarizationRules).toBe(1);
      expect(mockSummarizationRuleRepository.save).toHaveBeenCalled();
    });

    it("should import auto-responder settings", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockBatchScheduleRepository.findOne.mockResolvedValue(null);
      mockBlockedSenderRepository.findOne.mockResolvedValue(null);
      mockBlockedKeywordRepository.findOne.mockResolvedValue(null);
      mockUserContextRepository.findOne.mockResolvedValue(null);
      mockSummarizationRuleRepository.findOne.mockResolvedValue(null);

      const result = await service.importUserData(userId, validImportData);

      expect(result.success).toBe(true);
      expect(result.imported.autoResponderSettings).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
        autoResponderSettings: validImportData.autoResponderSettings,
      });
    });

    it("should respect section options", async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId });

      const result = await service.importUserData(userId, validImportData, {
        mergeMode: "merge",
        sections: {
          profile: false,
          batchSchedule: false,
          blockedSenders: true,
          blockedKeywords: false,
          contexts: false,
          toneRules: false,
          summarizationRules: false,
          autoResponderSettings: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.imported.profile).toBe(false);
      expect(result.imported.batchSchedule).toBe(false);
    });
  });
});
