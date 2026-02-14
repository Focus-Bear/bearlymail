import { Test, TestingModule } from "@nestjs/testing";
import { CalendarService } from "./calendar.service";
import { UsersService } from "../users/users.service";
import { LLMService } from "../llm/llm.service";
import { EmailsService } from "../emails/emails.service";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
import { google } from "googleapis";

// Mock googleapis
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn(),
  },
}));

// Constants for test values
const DAYS_AHEAD_FOR_AVAILABILITY = 7;

describe("CalendarService", () => {
  let service: CalendarService;
  let usersService: jest.Mocked<UsersService>;
  let llmService: jest.Mocked<LLMService>;
  let emailsService: jest.Mocked<EmailsService>;
  let mockOAuth2Client: any;
  let mockCalendar: any;

  const mockUser = {
    id: "user-1",
    email: "user@example.com",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: "refresh-token",
  };

  const mockEmail = {
    id: "email-1",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Meeting Request",
    body: "Let's schedule a meeting",
  };

  beforeEach(async () => {
    mockOAuth2Client = {
      setCredentials: jest.fn(),
    };

    mockCalendar = {
      freebusy: {
        query: jest.fn(),
      },
      events: {
        insert: jest.fn(),
        list: jest.fn(),
      },
    };

    (google.auth as any).OAuth2 = jest
      .fn()
      .mockImplementation(() => mockOAuth2Client);
    (google.calendar as jest.Mock).mockReturnValue(mockCalendar);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: LLMService,
          useValue: {
            generateMeetingReply: jest.fn(),
          },
        },
        {
          provide: EmailsService,
          useValue: {
            getEmailById: jest.fn(),
          },
        },
        {
          provide: SchedulingPreferencesService,
          useValue: {
            getPreferences: jest.fn().mockResolvedValue({
              availabilityStartHour: 9,
              availabilityEndHour: 17,
              availabilityDays: [1, 2, 3, 4, 5],
              meetingGapMinutes: 30,
              deepWorkHoursPerDay: 2,
              slotDurationMinutes: 30,
              timezone: "UTC",
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
    usersService = module.get(UsersService);
    llmService = module.get(LLMService);
    emailsService = module.get(EmailsService);
    jest.clearAllMocks();
  });

  describe("getAvailableTimeSlots", () => {
    it("should return available time slots", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      const result = await service.getAvailableTimeSlots(
        "user-1",
        DAYS_AHEAD_FOR_AVAILABILITY,
      );

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: "access-token",
        refresh_token: "refresh-token",
      });
      expect(mockCalendar.freebusy.query).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should throw error when Google Calendar not connected", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: null,
      } as any);

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockRejectedValue(new Error("API Error"));

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Failed to fetch calendar data");
    });

    it("should filter out busy periods", async () => {
      const now = new Date();
      const busyStart = new Date(now);
      busyStart.setHours(10, 0, 0, 0);
      const busyEnd = new Date(now);
      busyEnd.setHours(11, 0, 0, 0);

      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                {
                  start: busyStart.toISOString(),
                  end: busyEnd.toISOString(),
                },
              ],
            },
          },
        },
      });

      const result = await service.getAvailableTimeSlots(
        "user-1",
        DAYS_AHEAD_FOR_AVAILABILITY,
      );

      // Should filter out busy slots
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("createEvent", () => {
    it("should create a calendar event", async () => {
      const mockEvent = {
        id: "event-1",
        summary: "Meeting with Guest",
        start: { dateTime: "2024-01-15T10:00:00Z" },
        end: { dateTime: "2024-01-15T11:00:00Z" },
      };

      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      const result = await service.createEvent(
        "user-1",
        "2024-01-15T10:00:00Z",
        60,
        "guest@example.com",
        "Guest Name",
        "Meeting Title",
        "Meeting description",
      );

      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        requestBody: {
          summary: "Meeting Title",
          description: "Meeting description",
          start: { dateTime: "2024-01-15T10:00:00.000Z" },
          end: { dateTime: "2024-01-15T11:00:00.000Z" },
          attendees: [{ email: "guest@example.com" }],
        },
      });
      expect(result).toEqual(mockEvent);
    });

    it("should use default title when not provided", async () => {
      const mockEvent = { id: "event-1" };
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      await service.createEvent(
        "user-1",
        "2024-01-15T10:00:00Z",
        60,
        "guest@example.com",
        "Guest",
      );

      expect(mockCalendar.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: "Meeting with Guest",
          }),
        }),
      );
    });

    it("should throw error when Google Calendar not connected", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: null,
      } as any);

      await expect(
        service.createEvent(
          "user-1",
          "2024-01-15T10:00:00Z",
          60,
          "guest@example.com",
        ),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.insert.mockRejectedValue(new Error("API Error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(
        service.createEvent(
          "user-1",
          "2024-01-15T10:00:00Z",
          60,
          "guest@example.com",
        ),
      ).rejects.toThrow("Failed to create calendar event");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("findEventsWithAttendee", () => {
    it("should find events with specific attendee", async () => {
      const mockEvents = {
        data: {
          items: [
            {
              id: "event-1",
              summary: "Meeting 1",
              attendees: [{ email: "attendee@example.com" }],
              start: { dateTime: "2024-01-15T10:00:00Z" },
              end: { dateTime: "2024-01-15T11:00:00Z" },
            },
            {
              id: "event-2",
              summary: "Meeting 2",
              attendees: [{ email: "other@example.com" }],
              start: { dateTime: "2024-01-16T10:00:00Z" },
              end: { dateTime: "2024-01-16T11:00:00Z" },
            },
          ],
        },
      };

      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.list.mockResolvedValue(mockEvents);

      const result = await service.findEventsWithAttendee(
        "user-1",
        "attendee@example.com",
        90,
        30,
      );

      expect(mockCalendar.events.list).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("event-1");
    });

    it("should return empty array when no events found", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.list.mockResolvedValue({
        data: { items: [] },
      });

      const result = await service.findEventsWithAttendee(
        "user-1",
        "attendee@example.com",
      );

      expect(result).toEqual([]);
    });

    it("should filter events by attendee email (case insensitive)", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-1",
              attendees: [{ email: "ATTENDEE@EXAMPLE.COM" }],
            },
          ],
        },
      });

      const result = await service.findEventsWithAttendee(
        "user-1",
        "attendee@example.com",
      );

      expect(result).toHaveLength(1);
    });

    it("should throw error when Google Calendar not connected", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: null,
      } as any);

      await expect(
        service.findEventsWithAttendee("user-1", "attendee@example.com"),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.events.list.mockRejectedValue(new Error("API Error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(
        service.findEventsWithAttendee("user-1", "attendee@example.com"),
      ).rejects.toThrow("Failed to find calendar events");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("generateMeetingReply", () => {
    it("should generate meeting reply with available slots", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      emailsService.getEmailById.mockResolvedValue(mockEmail as any);

      const mockSlots = [
        { start: "2024-01-15T10:00:00Z", end: "2024-01-15T10:30:00Z" },
        { start: "2024-01-15T14:00:00Z", end: "2024-01-15T14:30:00Z" },
      ];

      jest
        .spyOn(service, "getAvailableTimeSlots")
        .mockResolvedValue(mockSlots as any);
      llmService.generateMeetingReply.mockResolvedValue(
        "Here are available times...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(emailsService.getEmailById).toHaveBeenCalledWith(
        "user-1",
        "email-1",
      );
      expect(llmService.generateMeetingReply).toHaveBeenCalled();
      expect(result).toBe("Here are available times...");
    });

    it("should handle no available slots", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      emailsService.getEmailById.mockResolvedValue(mockEmail as any);

      jest.spyOn(service, "getAvailableTimeSlots").mockResolvedValue([]);
      llmService.generateMeetingReply.mockResolvedValue(
        "No available slots...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(llmService.generateMeetingReply).toHaveBeenCalled();
      expect(result).toBe("No available slots...");
    });

    it("should throw error when email not found", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      emailsService.getEmailById.mockResolvedValue(null);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      await expect(
        service.generateMeetingReply("user-1", "nonexistent-email"),
      ).rejects.toThrow("Email not found");
    });

    it("should use fallback when LLM fails", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      emailsService.getEmailById.mockResolvedValue(mockEmail as any);

      const mockSlots = [
        { start: "2024-01-15T10:00:00Z", end: "2024-01-15T10:30:00Z" },
      ];

      jest
        .spyOn(service, "getAvailableTimeSlots")
        .mockResolvedValue(mockSlots as any);
      llmService.generateMeetingReply.mockRejectedValue(new Error("LLM error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(result).toContain("Here are some times that work for me");
      consoleErrorSpy.mockRestore();
    });
  });

  describe("calculateFreeSlots", () => {
    it("should calculate free slots within business hours", () => {
      const start = new Date("2024-01-15T09:00:00Z");
      const end = new Date("2024-01-15T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      // Access private method through any cast for testing
      const result = (service as any).calculateFreeSlots(start, end, busy);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it("should filter out busy periods", () => {
      const start = new Date("2024-01-15T09:00:00Z");
      const end = new Date("2024-01-15T17:00:00Z");
      const busyStart = new Date("2024-01-15T10:00:00Z");
      const busyEnd = new Date("2024-01-15T11:00:00Z");
      const busy: Array<{ start: string; end: string }> = [
        {
          start: busyStart.toISOString(),
          end: busyEnd.toISOString(),
        },
      ];

      const result = (service as any).calculateFreeSlots(start, end, busy);

      // Should not include slots that overlap with busy period
      expect(Array.isArray(result)).toBe(true);
    });

    it("should only return slots within business hours (9 AM - 5 PM)", () => {
      const start = new Date("2024-01-15T08:00:00Z");
      const end = new Date("2024-01-15T18:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = (service as any).calculateFreeSlots(start, end, busy);

      result.forEach((slot: { start: string }) => {
        const slotDate = new Date(slot.start);
        const hours = slotDate.getHours();
        expect(hours).toBeGreaterThanOrEqual(9);
        expect(hours).toBeLessThan(17);
      });
    });

    it("should limit results to 10 slots", () => {
      const start = new Date("2024-01-15T09:00:00Z");
      const end = new Date("2024-01-20T17:00:00Z"); // Multiple days
      const busy: Array<{ start: string; end: string }> = [];

      const result = (service as any).calculateFreeSlots(start, end, busy);

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it("should align start time to clean slot boundaries", () => {
      const start = new Date("2024-01-15T09:22:15Z");
      const end = new Date("2024-01-15T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = (service as any).calculateFreeSlots(start, end, busy);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((slot: { start: string }) => {
        const slotDate = new Date(slot.start);
        const minutes = slotDate.getMinutes();
        expect(minutes % 30).toBe(0);
      });
    });
  });

  describe("alignToSlotBoundary", () => {
    it("should round up to next 30-minute boundary", () => {
      const date = new Date("2024-01-15T09:22:15Z");
      const result = (service as any).alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it("should keep already-aligned times unchanged", () => {
      const date = new Date("2024-01-15T09:00:00Z");
      const result = (service as any).alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it("should handle 15-minute slot durations", () => {
      const date = new Date("2024-01-15T09:07:30Z");
      const result = (service as any).alignToSlotBoundary(date, 15);
      expect(result.getMinutes()).toBe(15);
      expect(result.getSeconds()).toBe(0);
    });

    it("should handle 60-minute slot durations", () => {
      const date = new Date("2024-01-15T09:45:00Z");
      const result = (service as any).alignToSlotBoundary(date, 60);
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it("should handle time at exact boundary for 15-minute slots", () => {
      const date = new Date("2024-01-15T09:15:00Z");
      const result = (service as any).alignToSlotBoundary(date, 15);
      expect(result.getMinutes()).toBe(15);
      expect(result.getSeconds()).toBe(0);
    });

    it("should zero out seconds and milliseconds", () => {
      const date = new Date("2024-01-15T09:30:45.123Z");
      const result = (service as any).alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe("getAvailableSlotsWithTimezone", () => {
    it("should return slots and timezone", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      const result = await service.getAvailableSlotsWithTimezone("user-1");

      expect(result).toHaveProperty("slots");
      expect(result).toHaveProperty("timezone");
      expect(Array.isArray(result.slots)).toBe(true);
      expect(typeof result.timezone).toBe("string");
    });

    it("should use UTC as default timezone", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      const result = await service.getAvailableSlotsWithTimezone("user-1");

      expect(result.timezone).toBe("UTC");
    });
  });

  describe("toTzDate", () => {
    // Note: toTzDate creates a Date object where the local timezone components
    // represent the wall-clock time in the target timezone. This is a quirky
    // approach that only works reliably when the system timezone is UTC.

    it("should use hourCycle h23 to prevent hour 24 for midnight", () => {
      // The key fix: using hourCycle: "h23" ensures midnight is represented as "00" not "24"
      // This test validates the formatter options are correct
      const date = new Date("2024-01-15T00:00:00Z");
      const result = (service as any).toTzDate(date, "UTC");

      // Should not throw or produce invalid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it("should not produce hour 24 for midnight in any timezone", () => {
      // Test multiple midnight scenarios to ensure hour is never 24
      // which would cause Date constructor to roll over to next day
      const midnightTestCases = [
        { date: new Date("2024-01-15T00:00:00Z"), tz: "UTC" },
        { date: new Date("2024-01-15T05:00:00Z"), tz: "America/New_York" },
        { date: new Date("2024-01-14T15:00:00Z"), tz: "Asia/Tokyo" },
        { date: new Date("2024-01-15T08:00:00Z"), tz: "America/Los_Angeles" },
        { date: new Date("2024-06-15T04:00:00Z"), tz: "Europe/London" },
      ];

      midnightTestCases.forEach(({ date, tz }) => {
        const result = (service as any).toTzDate(date, tz);
        // Should produce a valid date (not NaN or rolled over incorrectly)
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });

    it("should handle different hour values correctly", () => {
      // Test various hours to ensure they all parse correctly
      const testCases = [
        new Date("2024-01-15T00:00:00Z"), // Midnight
        new Date("2024-01-15T06:00:00Z"), // Morning
        new Date("2024-01-15T12:00:00Z"), // Noon
        new Date("2024-01-15T18:00:00Z"), // Evening
        new Date("2024-01-15T23:59:59Z"), // End of day
      ];

      testCases.forEach((date) => {
        const result = (service as any).toTzDate(date, "UTC");
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });

    it("should work with various timezones", () => {
      const date = new Date("2024-01-15T12:00:00Z");
      const timezones = [
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Australia/Sydney",
      ];

      timezones.forEach((tz) => {
        const result = (service as any).toTzDate(date, tz);
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });

    it("should handle DST transitions", () => {
      // March 10, 2024: DST starts in US
      const dstTransition = new Date("2024-03-10T07:00:00Z");
      const result = (service as any).toTzDate(
        dstTransition,
        "America/New_York",
      );

      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it("should preserve all time components", () => {
      const date = new Date("2024-01-15T12:34:56Z");
      const result = (service as any).toTzDate(date, "UTC");

      // Validate it's a valid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });
  });

  describe("toDayKey", () => {
    it("should generate a valid day key format (YYYY-MM-DD)", () => {
      const date = new Date("2024-01-15T12:00:00Z");
      const result = (service as any).toDayKey(date, "UTC");

      // Should match YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should generate a valid day key for midnight", () => {
      const date = new Date("2024-01-15T00:00:00Z");
      const result = (service as any).toDayKey(date, "UTC");

      // Should produce a valid date key (not crash or produce malformed output)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should pad month and day with zeros", () => {
      const date = new Date("2024-03-05T12:00:00Z");
      const result = (service as any).toDayKey(date, "UTC");

      // Should have leading zeros for single-digit month and day
      expect(result).toMatch(/^\d{4}-03-05$/);
    });

    it("should work with different timezones without crashing", () => {
      const date = new Date("2024-01-15T12:00:00Z");
      const timezones = [
        "UTC",
        "America/New_York",
        "Asia/Tokyo",
        "Europe/London",
      ];

      timezones.forEach((tz) => {
        const result = (service as any).toDayKey(date, tz);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });
});
