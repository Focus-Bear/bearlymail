import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { BatchScheduleService } from "./batch-schedule.service";

describe("BatchScheduleService", () => {
  let service: BatchScheduleService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEmailThreadRepository = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    query: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchScheduleService,
        {
          provide: getRepositoryToken(BatchSchedule),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
      ],
    }).compile();

    service = module.get<BatchScheduleService>(BatchScheduleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockEmailThreadRepository.update.mockResolvedValue({ affected: 0 });
    mockEmailThreadRepository.query.mockResolvedValue([[], 0]);
  });

  describe("getSchedule", () => {
    it("should return schedule for user", async () => {
      const userId = "user-123";
      const mockSchedule = {
        id: "schedule-1",
        userId,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00", "17:00"],
        timezone: "UTC",
        isEnabled: true,
      };

      mockRepository.findOne.mockResolvedValue(mockSchedule);

      const result = await service.getSchedule(userId);

      expect(result).toEqual(mockSchedule);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it("should return null when schedule not found", async () => {
      const userId = "user-123";

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getSchedule(userId);

      expect(result).toBeNull();
    });
  });

  describe("upsertSchedule", () => {
    it("should create new schedule when none exists", async () => {
      const userId = "user-123";
      const scheduleData = {
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00", "17:00"],
        timezone: "America/New_York",
        isEnabled: true,
        urgentBypassSchedule: false,
      };
      const mockSchedule = {
        id: "schedule-1",
        userId,
        ...scheduleData,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockSchedule);
      mockRepository.save.mockResolvedValue(mockSchedule);

      const result = await service.upsertSchedule(userId, scheduleData);

      expect(result).toEqual(mockSchedule);
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        ...scheduleData,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockSchedule);
    });

    it("should normalize string delivery days to numbers when creating", async () => {
      const userId = "user-123";
      const scheduleData = {
        // strings as would come from DB round-trip
        deliveryDays: ["1", "2", "3"],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: false,
      };
      const mockSchedule = {
        id: "schedule-1",
        userId,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: false,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockSchedule);
      mockRepository.save.mockResolvedValue(mockSchedule);

      await service.upsertSchedule(userId, scheduleData);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryDays: [1, 2, 3],
        }),
      );
    });

    it("should deduplicate delivery days when saving", async () => {
      const userId = "user-123";
      // Corrupted data with duplicates (strings and numbers mixed)
      const scheduleData = {
        deliveryDays: ["1", "1", 1, "2", "2", 2, "3", "3", 3],
        deliveryTimes: ["11:00", "15:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: true,
      };
      const existingSchedule = {
        id: "schedule-1",
        userId,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["11:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: false,
      };

      mockRepository.findOne.mockResolvedValue(existingSchedule);
      mockRepository.save.mockResolvedValue({
        ...existingSchedule,
        deliveryDays: [1, 2, 3],
      });

      await service.upsertSchedule(userId, scheduleData);

      // The saved schedule should have deduplicated days
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryDays: [1, 2, 3],
        }),
      );
    });

    it("should filter out invalid delivery day values", async () => {
      const userId = "user-123";
      const scheduleData = {
        // 7, -1, 8 are invalid (0-6 only)
        deliveryDays: [1, 2, 7, -1, 8, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: false,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ id: "schedule-1", userId });
      mockRepository.save.mockResolvedValue({ id: "schedule-1", userId });

      await service.upsertSchedule(userId, scheduleData);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryDays: [1, 2, 3],
        }),
      );
    });

    it("should update existing schedule", async () => {
      const userId = "user-123";
      const existingSchedule = {
        id: "schedule-1",
        userId,
        deliveryDays: [1, 2],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: false,
      };
      const scheduleData = {
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "17:00"],
        timezone: "America/New_York",
        isEnabled: true,
        urgentBypassSchedule: true,
      };

      mockRepository.findOne.mockResolvedValue(existingSchedule);
      mockRepository.save.mockResolvedValue({
        ...existingSchedule,
        ...scheduleData,
      });

      const result = await service.upsertSchedule(userId, scheduleData);

      expect(result.deliveryDays).toEqual(scheduleData.deliveryDays);
      expect(result.deliveryTimes).toEqual(scheduleData.deliveryTimes);
      expect(result.timezone).toBe(scheduleData.timezone);
      expect(result.urgentBypassSchedule).toBe(
        scheduleData.urgentBypassSchedule,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("upsertSchedule - reschedule existing batched emails", () => {
    const userId = "user-123";
    const baseSchedule = {
      id: "schedule-1",
      userId,
      deliveryDays: [1, 2, 3, 4, 5],
      deliveryTimes: ["11:00", "15:00"],
      timezone: "UTC",
      isEnabled: true,
      urgentBypassSchedule: true,
    };

    beforeEach(() => {
      mockRepository.findOne.mockResolvedValue(baseSchedule);
      mockRepository.save.mockImplementation((segment) =>
        Promise.resolve({ ...baseSchedule, ...segment }),
      );
    });

    it("should release all batched threads immediately when schedule is disabled", async () => {
      const disabledSchedule = { ...baseSchedule, isEnabled: false };
      mockRepository.save.mockResolvedValue(disabledSchedule);

      await service.upsertSchedule(userId, {
        ...disabledSchedule,
        deliveryDays: [1, 2, 3, 4, 5],
      });

      // The past-due release happens via raw query first, then update releases the rest
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { userId, isBatched: true },
        expect.objectContaining({ isBatched: false }),
      );
    });

    it("should release all batched threads when no delivery days are configured", async () => {
      const emptyDaysSchedule = {
        ...baseSchedule,
        deliveryDays: [],
        isEnabled: true,
      };
      mockRepository.save.mockResolvedValue(emptyDaysSchedule);

      await service.upsertSchedule(userId, {
        ...emptyDaysSchedule,
        deliveryDays: [],
      });

      // The past-due release happens via raw query first, then update releases the rest
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { userId, isBatched: true },
        expect.objectContaining({ isBatched: false }),
      );
    });

    it("should run raw SQL update to move far-future batchReleaseAt to next schedule window", async () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      mockRepository.save.mockResolvedValue(baseSchedule);

      await service.upsertSchedule(userId, {
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["11:00", "15:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: true,
      });

      // Should issue raw SQL update for threads with batchReleaseAt > new delivery time
      // First call is the past-due release query, second is the reschedule query
      const { calls } = mockEmailThreadRepository.query.mock;
      const rescheduleCall = calls.find((item: unknown[]) =>
        (item[0] as string).includes("batchReleaseAt"),
      );
      expect(rescheduleCall).toBeDefined();
      expect(rescheduleCall![0]).toContain("UPDATE email_threads");
      expect(mockEmailThreadRepository.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE email_threads"),
        expect.arrayContaining([
          // newReleaseTime
          expect.any(Date),
          expect.stringContaining("Schedule updated"),
          userId,
        ]),
      );

      // The reschedule call is the second query (first is the past-due release)
      const rescheduleQueryArgs =
        mockEmailThreadRepository.query.mock.calls[1][1];
      // The new release time should be Monday at 11am UTC (next window from 8am)
      const newReleaseTime = rescheduleQueryArgs[0] as Date;
      expect(newReleaseTime.toISOString()).toBe("2024-01-08T11:00:00.000Z");

      jest.useRealTimers();
    });

    it("should not call emailThreadRepository.update when schedule is enabled with delivery windows", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));
      mockRepository.save.mockResolvedValue(baseSchedule);

      await service.upsertSchedule(userId, {
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["11:00", "15:00"],
        timezone: "UTC",
        isEnabled: true,
        urgentBypassSchedule: true,
      });

      // emailThreadRepository.update is for disabled/empty schedules only;
      // the past-due release and rescheduling use raw SQL (query)
      expect(mockEmailThreadRepository.update).not.toHaveBeenCalled();
      // Raw query should be called twice: once for past-due, once for rescheduling
      expect(mockEmailThreadRepository.query).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe("getNextBatchReleaseTime", () => {
    it("should return null when batching is disabled", () => {
      const schedule = {
        isEnabled: false,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
      } as BatchSchedule;

      const result = service.getNextBatchReleaseTime(schedule, 0);

      expect(result).toBeNull();
    });

    it("should return null when priorityScore >= 75 and urgentBypassSchedule is enabled", () => {
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        urgentBypassSchedule: true,
      } as BatchSchedule;

      // Priority score 75 (>= 75) should bypass
      const result = service.getNextBatchReleaseTime(schedule, 75);

      expect(result).toBeNull();
    });

    it("should NOT bypass when priorityScore < 75 even with urgentBypassSchedule enabled", () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Monday-Friday
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: true,
      } as BatchSchedule;

      // Priority score 74 (not >= 75) should NOT bypass
      const result = service.getNextBatchReleaseTime(schedule, 74);

      // Should return next scheduled time, not null
      expect(result).not.toBeNull();

      jest.useRealTimers();
    });

    it("should return null when no delivery days configured", () => {
      const schedule = {
        isEnabled: true,
        deliveryDays: [],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextBatchReleaseTime(schedule, 0);

      expect(result).toBeNull();
    });
  });

  describe("isWithinDeliveryWindow", () => {
    it("should return true when batching is disabled", () => {
      const schedule = {
        isEnabled: false,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
      } as BatchSchedule;

      const result = service.isWithinDeliveryWindow(schedule);

      expect(result).toBe(true);
    });

    it("should return false when not a delivery day", () => {
      jest.useFakeTimers();
      // Sunday (0)
      jest.setSystemTime(new Date("2024-01-07T10:00:00Z"));

      // Monday-Friday
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
      } as BatchSchedule;

      const result = service.isWithinDeliveryWindow(schedule);

      expect(result).toBe(false);

      jest.useRealTimers();
    });

    it("should handle delivery days stored as strings in database", () => {
      jest.useFakeTimers();
      // Monday 8am UTC, within delivery window (09:00 - 09:30)
      jest.setSystemTime(new Date("2024-01-08T09:10:00Z"));

      const schedule = {
        isEnabled: true,
        // Strings from DB
        deliveryDays: ["1", "2", "3", "4", "5"],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
      } as BatchSchedule;

      const result = service.isWithinDeliveryWindow(schedule);

      expect(result).toBe(true);

      jest.useRealTimers();
    });

    it("should return false on Sunday with string delivery days for weekdays only", () => {
      jest.useFakeTimers();
      // Sunday 10am UTC
      jest.setSystemTime(new Date("2024-01-07T10:00:00Z"));

      const schedule = {
        isEnabled: true,
        // Mon-Fri as strings
        deliveryDays: ["1", "2", "3", "4", "5"],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
      } as BatchSchedule;

      const result = service.isWithinDeliveryWindow(schedule);

      expect(result).toBe(false);

      jest.useRealTimers();
    });
  });

  describe("getDefaultSchedule", () => {
    it("should return default schedule configuration", () => {
      const result = service.getDefaultSchedule();

      expect(result.deliveryDays).toEqual([1, 2, 3, 4, 5]);
      expect(result.deliveryTimes).toEqual(["11:00", "15:00"]);
      // Empty so the client fills in the browser-detected zone (a bare "UTC"
      // isn't a valid <select> option and fell back to Africa/Abidjan).
      expect(result.timezone).toBe("");
      expect(result.isEnabled).toBe(true);
      expect(result.urgentBypassSchedule).toBe(true);
    });
  });

  describe("getNextScheduledDeliveryTime - timezone conversion", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("should calculate next delivery time correctly in UTC", () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Monday-Friday
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 9am UTC
      expect(result?.toISOString()).toBe("2024-01-08T09:00:00.000Z");
    });

    it("should calculate next delivery time correctly in America/New_York", () => {
      jest.useFakeTimers();
      // Monday 8am UTC = Monday 3am EST (UTC-5)
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Monday-Friday
      // 9am and 3pm EST
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "America/New_York",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 9am EST = 2pm UTC
      expect(result?.toISOString()).toBe("2024-01-08T14:00:00.000Z");
    });

    it("should calculate next delivery time correctly in Europe/London", () => {
      jest.useFakeTimers();
      // Monday 8am UTC = Monday 8am GMT (no offset in winter)
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Monday-Friday
      // 11am and 3pm GMT
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["11:00", "15:00"],
        timezone: "Europe/London",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 11am GMT = 11am UTC (winter time)
      expect(result?.toISOString()).toBe("2024-01-08T11:00:00.000Z");
    });

    it("should calculate next delivery time correctly in Asia/Tokyo", () => {
      jest.useFakeTimers();
      // Monday 8am UTC = Monday 5pm JST (UTC+9)
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Monday-Friday
      // 9am and 3pm JST
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "Asia/Tokyo",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Current time is Monday 5pm JST, so next delivery is Tuesday 9am JST
      // Tuesday 9am JST = Tuesday 0am UTC
      expect(result?.toISOString()).toBe("2024-01-09T00:00:00.000Z");
    });

    it("should handle DST transition correctly (spring forward)", () => {
      jest.useFakeTimers();
      // March 10, 2024 is when DST starts in America/New_York (2am → 3am)
      // Set time to Sunday 1am UTC = Saturday 8pm EST
      jest.setSystemTime(new Date("2024-03-10T01:00:00Z"));

      // All days
      // 9am EST/EDT
      const schedule = {
        isEnabled: true,
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        deliveryTimes: ["09:00"],
        timezone: "America/New_York",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Sunday 9am EDT = 1pm UTC (EDT is UTC-4)
      // The DST transition happens at 2am Sunday, so 9am Sunday is in EDT
      expect(result?.getUTCHours()).toBe(13);
      expect(result?.getUTCDate()).toBe(10);
    });

    it("should handle DST transition correctly (fall back)", () => {
      jest.useFakeTimers();
      // November 3, 2024 is when DST ends in America/New_York (2am → 1am)
      // Set time to Sunday 1am UTC = Saturday 9pm EDT
      jest.setSystemTime(new Date("2024-11-03T01:00:00Z"));

      // All days
      // 9am EDT/EST
      const schedule = {
        isEnabled: true,
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        deliveryTimes: ["09:00"],
        timezone: "America/New_York",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Sunday 9am EST = 2pm UTC (EST is UTC-5)
      // After DST ends at 2am Sunday, 9am is in EST
      expect(result?.getUTCHours()).toBe(14);
      expect(result?.getUTCDate()).toBe(3);
    });

    it("should skip to next delivery time on same day if current time passed", () => {
      jest.useFakeTimers();
      // Monday 10am UTC
      jest.setSystemTime(new Date("2024-01-08T10:00:00Z"));

      // Monday-Friday
      // 9am and 3pm UTC
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 3pm UTC (skipped 9am)
      expect(result?.toISOString()).toBe("2024-01-08T15:00:00.000Z");
    });

    it("should move to next delivery day when all times passed today", () => {
      jest.useFakeTimers();
      // Monday 4pm UTC (after both delivery times)
      jest.setSystemTime(new Date("2024-01-08T16:00:00Z"));

      // Monday-Friday
      // 9am and 3pm UTC
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Tuesday at 9am UTC
      expect(result?.toISOString()).toBe("2024-01-09T09:00:00.000Z");
    });

    it("should skip to next delivery day when today is not a delivery day", () => {
      jest.useFakeTimers();
      // Sunday 10am UTC
      jest.setSystemTime(new Date("2024-01-07T10:00:00Z"));

      // Monday-Friday (no Sunday)
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 9am UTC
      expect(result?.toISOString()).toBe("2024-01-08T09:00:00.000Z");
    });

    it("should handle timezone where current date differs from UTC", () => {
      jest.useFakeTimers();
      // Monday 11pm UTC = Tuesday 8am JST (UTC+9)
      jest.setSystemTime(new Date("2024-01-08T23:00:00Z"));

      // Monday-Friday
      // 9am and 3pm JST
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "Asia/Tokyo",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Current time is Tuesday 8am JST, next is Tuesday 9am JST
      // Tuesday 9am JST = Tuesday 0am UTC
      expect(result?.toISOString()).toBe("2024-01-09T00:00:00.000Z");
    });

    it("should return null when no delivery days configured", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-08T10:00:00Z"));

      // No delivery days
      const schedule = {
        isEnabled: true,
        deliveryDays: [],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).toBeNull();
    });

    it("should return null when no delivery times configured", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-08T10:00:00Z"));

      // No delivery times
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: [],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).toBeNull();
    });

    it("should sort delivery times and use earliest available", () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // Unsorted
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["15:00", "09:00", "12:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should use earliest time (09:00), not the first in the array
      expect(result?.toISOString()).toBe("2024-01-08T09:00:00.000Z");
    });

    it("should handle negative UTC offsets correctly", () => {
      jest.useFakeTimers();
      // Monday 8am UTC = Monday 1am MST (UTC-7)
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // 9am and 3pm MST
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "America/Denver",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should be Monday at 9am MST = 4pm UTC
      expect(result?.toISOString()).toBe("2024-01-08T16:00:00.000Z");
    });

    it("should handle positive UTC offsets correctly", () => {
      jest.useFakeTimers();
      // Monday 8am UTC = Monday 7pm AEDT (UTC+11 during DST)
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      // 9am and 3pm AEDT
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "Australia/Sydney",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Current time is Monday 7pm AEDT, next delivery is Tuesday 9am AEDT
      // Tuesday 9am AEDT = Monday 10pm UTC
      expect(result?.toISOString()).toBe("2024-01-08T22:00:00.000Z");
    });

    it("should handle Australia/Melbourne timezone correctly", () => {
      jest.useFakeTimers();
      // Thursday 2:44 UTC = Thursday 1:44 PM AEDT (UTC+11)
      jest.setSystemTime(new Date("2026-02-13T02:44:00Z"));

      const schedule = {
        isEnabled: true,
        // Monday-Friday (0=Sun, 1=Mon, ..., 5=Fri)
        deliveryDays: [1, 2, 3, 4, 5],
        // 11am and 3pm AEDT
        deliveryTimes: ["11:00", "15:00"],
        timezone: "Australia/Melbourne",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Current time is Thursday 1:44 PM AEDT, next delivery is Thursday 3pm AEDT
      // Thursday 3pm AEDT (15:00) = Thursday 4am UTC (15:00 - 11:00)
      expect(result?.toISOString()).toBe("2026-02-13T04:00:00.000Z");
    });

    it("should handle delivery days stored as strings in database", () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      const schedule = {
        isEnabled: true,
        // Stored as strings in DB
        deliveryDays: ["1", "2", "3", "4", "5"],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should correctly parse string days and find Monday at 9am UTC
      expect(result?.toISOString()).toBe("2024-01-08T09:00:00.000Z");
    });

    it("should handle mixed string and number delivery days", () => {
      jest.useFakeTimers();
      // Monday 8am UTC
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z"));

      const schedule = {
        isEnabled: true,
        // Mixed types
        deliveryDays: [1, "2", 3, "4", 5],
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: false,
      } as BatchSchedule;

      const result = service.getNextScheduledDeliveryTime(schedule);

      expect(result).not.toBeNull();
      // Should correctly normalize all to numbers
      expect(result?.toISOString()).toBe("2024-01-08T09:00:00.000Z");
    });
  });
});
