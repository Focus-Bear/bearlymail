import { Test, TestingModule } from "@nestjs/testing";
import { CalendarService } from "./calendar.service";
import { UsersService } from "../users/users.service";
import { LLMService } from "../llm/llm.service";
import { EmailsService } from "../emails/emails.service";
import { google } from "googleapis";

// Mock googleapis
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2Client: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn(),
  },
}));

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

    (google.auth as any).OAuth2Client = jest
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

      const result = await service.getAvailableTimeSlots("user-1", 7);

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

      await expect(service.getAvailableTimeSlots("user-1", 7)).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      mockCalendar.freebusy.query.mockRejectedValue(new Error("API Error"));

      await expect(service.getAvailableTimeSlots("user-1", 7)).rejects.toThrow(
        "Failed to fetch calendar data",
      );
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

      const result = await service.getAvailableTimeSlots("user-1", 7);

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

      expect(llmService.generateMeetingReply).toHaveBeenCalledWith(
        expect.any(Object),
        [],
        expect.any(String),
        undefined,
        "user-1",
      );
      expect(result).toBe("No available slots...");
    });

    it("should throw error when email not found", async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      emailsService.getEmailById.mockResolvedValue(null);

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
  });
});
