import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as chrono from "chrono-node";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { SnoozeService } from "./snooze.service";

jest.mock("chrono-node", () => {
  const parse = jest.fn();
  // The parser selects chrono.<locale>.casual; share one mock so the existing
  // `chrono.parse` assertions still control the default (English) path.
  return {
    parse,
    en: { casual: { parse } },
    es: { casual: { parse } },
  };
});

/**
 * A chrono result carrying an explicit time, so `parseDurationToDate` returns
 * it unchanged rather than snapping a date-only phrase to the default hour.
 */
const chronoResultFor = (date: Date | null) =>
  date === null
    ? []
    : [{ start: { date: () => new Date(date), isCertain: () => true } }];

describe("SnoozeService", () => {
  let service: SnoozeService;
  let repository: jest.Mocked<Repository<Email>>;
  let threadRepository: jest.Mocked<Repository<EmailThread>>;
  let emailProviderManager: jest.Mocked<EmailProviderManager>;
  let boss: { send: jest.Mock };

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
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getPrimaryProvider: jest.fn(),
          },
        },
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: { send: jest.fn().mockResolvedValue("job-1") },
        },
      ],
    }).compile();

    service = module.get<SnoozeService>(SnoozeService);
    repository = module.get(getRepositoryToken(Email));
    threadRepository = module.get(getRepositoryToken(EmailThread));
    emailProviderManager = module.get(EmailProviderManager);
    boss = module.get(INJECT_TOKENS.PG_BOSS);
    jest.clearAllMocks();
    (chrono.parse as jest.Mock).mockReturnValue([]);
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

      const expectedTime = new Date("2024-01-06T08:00:00Z");
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse duration in weeks (w)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "2w");

      const expectedTime = new Date("2024-01-15T08:00:00Z");
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
      (chrono.parse as jest.Mock).mockReturnValue(chronoResultFor(chronoDate));
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
      (chrono.parse as jest.Mock).mockReturnValue(chronoResultFor(expected5pm));
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "5pm");

      expect(result.snoozeUntil?.getTime()).toBe(expected5pm.getTime());

      jest.useRealTimers();
    });

    it("should parse day and time (Wed 3pm) via chrono", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const expectedWed3pm = new Date("2024-01-03T15:00:00Z");
      (chrono.parse as jest.Mock).mockReturnValue(
        chronoResultFor(expectedWed3pm),
      );
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

  describe("bulkSnoozeEmails", () => {
    const wakeUpAt = new Date("2026-09-23T09:00:00.000Z");

    beforeEach(() => {
      (chrono.parse as jest.Mock).mockReturnValue(chronoResultFor(wakeUpAt));
      repository.find.mockResolvedValue([
        mockPartial<Email>({ id: "email-1", threadId: "gmail-thread-1" }),
        mockPartial<Email>({ id: "email-2", threadId: "gmail-thread-1" }),
        mockPartial<Email>({ id: "email-3", threadId: "gmail-thread-2" }),
      ]);
    });

    it("should do nothing when no email ids are given", async () => {
      const result = await service.bulkSnoozeEmails("user-1", [], "1h");

      expect(result).toEqual({
        snoozedEmailIds: [],
        threadCount: 0,
        snoozeUntil: null,
      });
      expect(repository.find).not.toHaveBeenCalled();
      expect(threadRepository.update).not.toHaveBeenCalled();
    });

    it("should snooze every thread of the selection until the same moment", async () => {
      const result = await service.bulkSnoozeEmails(
        "user-1",
        ["email-1", "email-2", "email-3"],
        "tomorrow 9am",
      );

      expect(result.snoozedEmailIds).toEqual(["email-1", "email-2", "email-3"]);
      expect(result.threadCount).toBe(2);
      expect(result.snoozeUntil).toEqual(wakeUpAt);

      // One parse for the whole batch: every thread must wake together.
      expect(chrono.parse).toHaveBeenCalledTimes(1);
      expect(threadRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        expect.objectContaining({
          isSnoozed: true,
          snoozeUntil: wakeUpAt,
          syncStatus: "unsynced",
        }),
      );
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        expect.objectContaining({ isSnoozed: true, snoozeUntil: wakeUpAt }),
      );
    });

    it("should queue one provider sync job per unique thread", async () => {
      await service.bulkSnoozeEmails(
        "user-1",
        ["email-1", "email-2", "email-3"],
        "tomorrow 9am",
      );

      const syncJobs = boss.send.mock.calls.filter(
        (call) => call[0] === JOB_NAMES.SNOOZE_THREAD_PROVIDER_SYNC,
      );
      expect(syncJobs).toHaveLength(2);
      expect(syncJobs.map((call) => call[1].threadId)).toEqual([
        "gmail-thread-1",
        "gmail-thread-2",
      ]);
      expect(syncJobs[0][1].snoozeUntil).toBe(wakeUpAt.toISOString());
      // The request must not wait on the provider — that is the job's work.
      expect(emailProviderManager.getPrimaryProvider).not.toHaveBeenCalled();
    });

    it("should not write anything when none of the ids match an email", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.bulkSnoozeEmails(
        "user-1",
        ["missing"],
        "1h",
      );

      expect(result.snoozedEmailIds).toEqual([]);
      expect(result.threadCount).toBe(0);
      expect(threadRepository.update).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(boss.send).not.toHaveBeenCalled();
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
