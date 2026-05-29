import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as chrono from "chrono-node";
import { Repository } from "typeorm";

import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { SnoozeService } from "./snooze.service";

jest.mock("chrono-node", () => {
  const parseDate = jest.fn();
  // The parser selects chrono.<locale>.casual; share one mock so the existing
  // `chrono.parseDate` assertions still control the default (English) path.
  return {
    parseDate,
    en: { casual: { parseDate } },
    es: { casual: { parseDate } },
  };
});

describe("SnoozeService", () => {
  let service: SnoozeService;
  let repository: jest.Mocked<Repository<Email>>;
  let threadRepository: jest.Mocked<Repository<EmailThread>>;
  let emailProviderManager: jest.Mocked<EmailProviderManager>;

  const mockEmail: Email = mockPartial({
    id: "email-1",
    userId: "user-1",
    subject: "Test Email",
    from: "sender@example.com",
    isSnoozed: false,
    snoozeUntil: null,
    emailThreadId: "thread-uuid-1",
    threadId: "gmail-thread-1",
    getPriorityScore: jest.fn().mockReturnValue(50),
  });

  const mockThread: EmailThread = mockPartial({
    id: "thread-uuid-1",
    userId: "user-1",
    threadId: "gmail-thread-1",
    isSnoozed: false,
    snoozeUntil: null,
    syncStatus: "synced",
    syncStatusUpdatedAt: null,
    lastUserOperationAt: null,
  });

  const mockProvider = {
    snoozeThread: jest.fn(),
    unsnoozeThread: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnoozeService,
        {
          provide: getRepositoryToken(Email),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
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

    service = module.get<SnoozeService>(SnoozeService);
    repository = module.get(getRepositoryToken(Email));
    threadRepository = module.get(getRepositoryToken(EmailThread));
    emailProviderManager = module.get(EmailProviderManager);
    jest.clearAllMocks();
    (chrono.parseDate as jest.Mock).mockReturnValue(null);
  });

  describe("snoozeEmail", () => {
    beforeEach(() => {
      repository.findOne.mockResolvedValue(mockEmail);
      repository.save.mockImplementation(async (email) => email as Email);
      threadRepository.findOne.mockResolvedValue({ ...mockThread });
      threadRepository.save.mockImplementation(
        async (thread) => thread as EmailThread,
      );
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);
      mockProvider.snoozeThread.mockResolvedValue(undefined);
    });

    it("should throw error if email not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.snoozeEmail("user-1", "nonexistent", "1h"),
      ).rejects.toThrow("Email not found");
    });

    it("should throw error if thread not found", async () => {
      threadRepository.findOne.mockResolvedValue(null);

      await expect(
        service.snoozeEmail("user-1", "email-1", "1h"),
      ).rejects.toThrow("thread not found");
    });

    it("should set syncStatus to unsynced before provider call", async () => {
      let capturedThreadBeforeProvider: unknown = null;
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          if (capturedThreadBeforeProvider === null) {
            capturedThreadBeforeProvider = { ...thread };
          }
          return thread as EmailThread;
        },
      );
      mockProvider.snoozeThread.mockImplementation(async () => {
        expect(capturedThreadBeforeProvider.syncStatus).toBe("unsynced");
      });

      await service.snoozeEmail("user-1", "email-1", "1h");

      expect(capturedThreadBeforeProvider.syncStatus).toBe("unsynced");
    });

    it("should set syncStatus back to synced after provider confirms", async () => {
      const savedStates: string[] = [];
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          savedStates.push(thread.syncStatus);
          return thread as EmailThread;
        },
      );

      await service.snoozeEmail("user-1", "email-1", "1h");

      expect(savedStates).toContain("unsynced");
      expect(savedStates[savedStates.length - 1]).toBe("synced");
    });

    it("should leave syncStatus as unsynced if provider sync fails", async () => {
      mockProvider.snoozeThread.mockRejectedValue(new Error("Provider error"));
      const savedStates: string[] = [];
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          savedStates.push(thread.syncStatus);
          return thread as EmailThread;
        },
      );

      await service.snoozeEmail("user-1", "email-1", "1h");

      expect(savedStates).toContain("unsynced");
      expect(savedStates[savedStates.length - 1]).toBe("unsynced");
    });

    it("should find thread by emailThreadId (UUID FK)", async () => {
      await service.snoozeEmail("user-1", "email-1", "1h");

      expect(threadRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "thread-uuid-1", userId: "user-1" },
        }),
      );
    });

    it("should fall back to threadId lookup when emailThreadId lookup fails", async () => {
      threadRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockThread });

      const result = await service.snoozeEmail("user-1", "email-1", "1h");

      expect(result.isSnoozed).toBe(true);
      expect(threadRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it("should set lastUserOperationAt on snooze", async () => {
      let savedThread: unknown = null;
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          if (!savedThread) savedThread = { ...thread };
          return thread as EmailThread;
        },
      );

      await service.snoozeEmail("user-1", "email-1", "1h");

      expect(savedThread.lastUserOperationAt).toBeInstanceOf(Date);
    });

    it("should return structured response {id, isSnoozed, snoozeUntil}", async () => {
      const result = await service.snoozeEmail("user-1", "email-1", "1h");

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("isSnoozed", true);
      expect(result).toHaveProperty("snoozeUntil");
      expect(result.snoozeUntil).toBeInstanceOf(Date);
    });

    it("should parse duration in minutes (m)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "30m");

      const expectedTime = new Date(now.getTime() + 30 * 60 * 1000);
      expect(result.isSnoozed).toBe(true);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse duration in hours (h)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "2h");

      const expectedTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse duration in days (d)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "5d");

      const expectedTime = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse duration in weeks (w)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "2w");

      const expectedTime = new Date(
        now.getTime() + 2 * 7 * 24 * 60 * 60 * 1000,
      );
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse day names (mon)", async () => {
      const now = new Date("2024-01-03T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "mon");

      const targetDay = 1;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) {
        daysUntil += SNOOZE_CONSTANTS.DAYS_IN_WEEK;
      }
      const expectedTime = new Date(now);
      expectedTime.setDate(now.getDate() + daysUntil);
      expectedTime.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);

      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should use chrono for natural language dates", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const chronoDate = new Date("2024-01-15T10:00:00Z");
      (chrono.parseDate as jest.Mock).mockReturnValue(chronoDate);
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail(
        "user-1",
        "email-1",
        "next monday",
      );

      expect(result.snoozeUntil?.getTime()).toBe(chronoDate.getTime());

      jest.useRealTimers();
    });

    it("should parse time-of-day (5pm) via chrono", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const expected5pm = new Date("2024-01-01T17:00:00Z");
      (chrono.parseDate as jest.Mock).mockReturnValue(expected5pm);
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "5pm");

      expect(result.snoozeUntil?.getTime()).toBe(expected5pm.getTime());

      jest.useRealTimers();
    });

    it("should parse day and time (Wed 3pm) via chrono", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const expectedWed3pm = new Date("2024-01-03T15:00:00Z");
      (chrono.parseDate as jest.Mock).mockReturnValue(expectedWed3pm);
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "Wed 3pm");

      expect(result.snoozeUntil?.getTime()).toBe(expectedWed3pm.getTime());

      jest.useRealTimers();
    });

    it("should parse 4 hours (4h)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "4h");

      const expectedTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse 6 hours (6h)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "6h");

      const expectedTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should default to 1 hour if parsing fails", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "invalid");

      const expectedTime = new Date(now.getTime() + 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });
  });

  describe("unsnoozeEmail", () => {
    const snoozedEmail = mockPartial({
      ...mockEmail,
      isSnoozed: true,
      snoozeUntil: new Date("2024-01-02T12:00:00Z"),
    });

    const snoozedThread = {
      ...mockThread,
      isSnoozed: true,
      snoozeUntil: new Date("2024-01-02T12:00:00Z"),
      syncStatus: "synced" as const,
    };

    beforeEach(() => {
      repository.findOne.mockResolvedValue(snoozedEmail);
      repository.save.mockImplementation(async (email) => email);
      threadRepository.findOne.mockResolvedValue({ ...snoozedThread });
      threadRepository.save.mockImplementation(
        async (thread) => thread as EmailThread,
      );
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);
      mockProvider.unsnoozeThread.mockResolvedValue(undefined);
    });

    it("should throw error if email not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.unsnoozeEmail("user-1", "nonexistent"),
      ).rejects.toThrow("Email not found");
    });

    it("should throw error if thread not found", async () => {
      threadRepository.findOne.mockResolvedValue(null);

      await expect(service.unsnoozeEmail("user-1", "email-1")).rejects.toThrow(
        "thread not found",
      );
    });

    it("should set syncStatus to unsynced before provider call", async () => {
      let capturedThreadBeforeProvider: unknown = null;
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          if (capturedThreadBeforeProvider === null) {
            capturedThreadBeforeProvider = { ...thread };
          }
          return thread as EmailThread;
        },
      );
      mockProvider.unsnoozeThread.mockImplementation(async () => {
        expect(capturedThreadBeforeProvider.syncStatus).toBe("unsynced");
      });

      await service.unsnoozeEmail("user-1", "email-1");

      expect(capturedThreadBeforeProvider.syncStatus).toBe("unsynced");
    });

    it("should set syncStatus back to synced after provider confirms", async () => {
      const savedStates: string[] = [];
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          savedStates.push(thread.syncStatus);
          return thread as EmailThread;
        },
      );

      await service.unsnoozeEmail("user-1", "email-1");

      expect(savedStates).toContain("unsynced");
      expect(savedStates[savedStates.length - 1]).toBe("synced");
    });

    it("should leave syncStatus as unsynced if provider sync fails", async () => {
      mockProvider.unsnoozeThread.mockRejectedValue(
        new Error("Provider error"),
      );
      const savedStates: string[] = [];
      threadRepository.save.mockImplementation(
        async (thread: Record<string, unknown>) => {
          savedStates.push(thread.syncStatus);
          return thread as EmailThread;
        },
      );

      await service.unsnoozeEmail("user-1", "email-1");

      expect(savedStates).toContain("unsynced");
      expect(savedStates[savedStates.length - 1]).toBe("unsynced");
    });

    it("should set isSnoozed to false", async () => {
      const result = await service.unsnoozeEmail("user-1", "email-1");

      expect(result.isSnoozed).toBe(false);
    });

    it("should set snoozeUntil to null", async () => {
      const result = await service.unsnoozeEmail("user-1", "email-1");

      expect(result.snoozeUntil).toBeNull();
    });

    it("should return structured response {id, isSnoozed, snoozeUntil}", async () => {
      const result = await service.unsnoozeEmail("user-1", "email-1");

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("isSnoozed", false);
      expect(result).toHaveProperty("snoozeUntil", null);
    });
  });

  describe("chrono-node natural language parsing (real library)", () => {
    const realChrono =
      jest.requireActual<typeof import("chrono-node")>("chrono-node");

    it("should parse '5pm' to today at 17:00", () => {
      const now = new Date("2024-01-15T10:00:00");
      const result = realChrono.parseDate("5pm", now);

      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(17);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should parse 'Wed 3pm' to the next Wednesday at 15:00", () => {
      // 2024-01-15 is a Monday
      const now = new Date("2024-01-15T10:00:00");
      const result = realChrono.parseDate("Wed 3pm", now);

      expect(result).not.toBeNull();
      // Wednesday is day 3
      expect(result!.getDay()).toBe(3);
      expect(result!.getHours()).toBe(15);
      expect(result!.getMinutes()).toBe(0);
    });
  });
});
