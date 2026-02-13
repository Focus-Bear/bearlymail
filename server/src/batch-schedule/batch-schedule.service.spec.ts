import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BatchScheduleService } from "./batch-schedule.service";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";

describe("BatchScheduleService", () => {
  let service: BatchScheduleService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchScheduleService,
        {
          provide: getRepositoryToken(BatchSchedule),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<BatchScheduleService>(BatchScheduleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z")); // Monday 8am UTC

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
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
      jest.setSystemTime(new Date("2024-01-07T10:00:00Z")); // Sunday (0)

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
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
      expect(result.timezone).toBe("UTC");
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm EST
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["11:00", "15:00"], // 11am and 3pm GMT
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm JST
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [0, 1, 2, 3, 4, 5, 6], // All days
        deliveryTimes: ["09:00"], // 9am EST/EDT
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [0, 1, 2, 3, 4, 5, 6], // All days
        deliveryTimes: ["09:00"], // 9am EDT/EST
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm UTC
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm UTC
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday (no Sunday)
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm JST
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [], // No delivery days
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: [], // No delivery times
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["15:00", "09:00", "12:00"], // Unsorted
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm MST
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

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5],
        deliveryTimes: ["09:00", "15:00"], // 9am and 3pm AEDT
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
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday (0=Sun, 1=Mon, ..., 5=Fri)
        deliveryTimes: ["11:00", "15:00"], // 11am and 3pm AEDT
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
        deliveryDays: ["1", "2", "3", "4", "5"] as any, // Stored as strings in DB
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
        deliveryDays: [1, "2", 3, "4", 5] as any, // Mixed types
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
