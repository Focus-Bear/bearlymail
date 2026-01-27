import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SnoozeService } from "./snooze.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import * as chrono from "chrono-node";

jest.mock("chrono-node", () => ({
  parseDate: jest.fn(),
}));

describe("SnoozeService", () => {
  let service: SnoozeService;
  let repository: jest.Mocked<Repository<Email>>;

  const mockEmail: Email = {
    id: "email-1",
    userId: "user-1",
    subject: "Test Email",
    from: "sender@example.com",
    isSnoozed: false,
    snoozeUntil: null,
    getPriorityScore: jest.fn().mockReturnValue(50),
  } as any;

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
    jest.clearAllMocks();
    (chrono.parseDate as jest.Mock).mockReturnValue(null);
  });

  describe("snoozeEmail", () => {
    beforeEach(() => {
      repository.findOne.mockResolvedValue(mockEmail);
      repository.save.mockImplementation(async (email) => email as Email);
    });

    it("should throw error if email not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.snoozeEmail("user-1", "nonexistent", "1h"),
      ).rejects.toThrow("Email not found");
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

    it("should parse duration in minutes (min)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "60min");

      const expectedTime = new Date(now.getTime() + 60 * 60 * 1000);
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

    it("should parse duration in hours (hr)", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "3hr");

      const expectedTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
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
      // Set to Wednesday (3)
      const now = new Date("2024-01-03T12:00:00Z"); // Wednesday
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "mon");

      // Should be next Monday (Jan 8, 2024) at 9 AM
      const expectedTime = new Date("2024-01-08T09:00:00Z");
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse day names for same day (next week)", async () => {
      // Set to Monday
      const now = new Date("2024-01-01T12:00:00Z"); // Monday
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "mon");

      // Should be next Monday (Jan 8) at 9 AM, not today
      const expectedTime = new Date("2024-01-08T09:00:00Z");
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should parse day names (tue, wed, thu, fri, sat, sun)", async () => {
      const now = new Date("2024-01-01T12:00:00Z"); // Monday
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const days = ["tue", "wed", "thu", "fri", "sat", "sun"];
      const expectedDates = [
        "2024-01-02T09:00:00Z", // Tuesday
        "2024-01-03T09:00:00Z", // Wednesday
        "2024-01-04T09:00:00Z", // Thursday
        "2024-01-05T09:00:00Z", // Friday
        "2024-01-06T09:00:00Z", // Saturday
        "2024-01-07T09:00:00Z", // Sunday
      ];

      for (let i = 0; i < days.length; i++) {
        const result = await service.snoozeEmail("user-1", "email-1", days[i]);
        const expectedTime = new Date(expectedDates[i]);
        expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());
      }

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
      expect(chrono.parseDate).toHaveBeenCalledWith("next monday");

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

    it("should handle case-insensitive duration strings", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "2H");

      const expectedTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should handle whitespace in duration strings", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const result = await service.snoozeEmail("user-1", "email-1", "  2h  ");

      const expectedTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      expect(result.snoozeUntil?.getTime()).toBe(expectedTime.getTime());

      jest.useRealTimers();
    });

    it("should set isSnoozed to true", async () => {
      const result = await service.snoozeEmail("user-1", "email-1", "1h");

      expect(result.isSnoozed).toBe(true);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe("unsnoozeEmail", () => {
    beforeEach(() => {
      const snoozedEmail = {
        ...mockEmail,
        isSnoozed: true,
        snoozeUntil: new Date("2024-01-02T12:00:00Z"),
        getPriorityScore: jest.fn().mockReturnValue(50),
      } as any;
      repository.findOne.mockResolvedValue(snoozedEmail);
      repository.save.mockImplementation(async (email) => email as any);
    });

    it("should throw error if email not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.unsnoozeEmail("user-1", "nonexistent"),
      ).rejects.toThrow("Email not found");
    });

    it("should set isSnoozed to false", async () => {
      const result = await service.unsnoozeEmail("user-1", "email-1");

      expect(result.isSnoozed).toBe(false);
      expect(repository.save).toHaveBeenCalled();
    });

    it("should set snoozeUntil to null", async () => {
      const result = await service.unsnoozeEmail("user-1", "email-1");

      expect(result.snoozeUntil).toBeNull();
    });
  });
});
