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
    repository = module.get<Repository<BatchSchedule>>(
      getRepositoryToken(BatchSchedule),
    );
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

    it("should return null when priorityScore > 50 and urgentBypassSchedule is enabled", () => {
      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3],
        deliveryTimes: ["09:00"],
        timezone: "UTC",
        urgentBypassSchedule: true,
      } as BatchSchedule;

      // Priority score 51 (> 50) should bypass
      const result = service.getNextBatchReleaseTime(schedule, 51);

      expect(result).toBeNull();
    });

    it("should NOT bypass when priorityScore <= 50 even with urgentBypassSchedule enabled", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-08T08:00:00Z")); // Monday 8am UTC

      const schedule = {
        isEnabled: true,
        deliveryDays: [1, 2, 3, 4, 5], // Monday-Friday
        deliveryTimes: ["09:00", "15:00"],
        timezone: "UTC",
        urgentBypassSchedule: true,
      } as BatchSchedule;

      // Priority score 50 (not > 50) should NOT bypass
      const result = service.getNextBatchReleaseTime(schedule, 50);

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
});
