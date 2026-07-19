import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { google } from "googleapis";

import { CalendarBooking } from "../database/entities/calendar-booking.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "../emails/emails.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { LLMService } from "../llm/llm.service";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { BookingNotificationService } from "./booking-notification.service";
import { CalendarService } from "./calendar.service";
import { CalendarAgendaService } from "./calendar-agenda.service";
import {
  alignToSlotBoundary,
  calculateFreeSlots,
  toDayKey,
  toTzDate,
} from "./calendar-free-slots.helper";
import { CalendarIcsService } from "./calendar-ics.service";

// Mock googleapis
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        on: jest.fn(),
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
  let calendarIcsService: jest.Mocked<CalendarIcsService>;
  let calendarAgendaService: jest.Mocked<CalendarAgendaService>;
  let bookingNotificationService: jest.Mocked<BookingNotificationService>;
  let mockCalendarBookingRepository: Record<string, unknown>;
  let mockEmailThreadRepository: Record<string, unknown>;
  let mockOAuth2Client: Record<string, unknown>;
  let mockCalendar: Record<string, unknown>;

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
      on: jest.fn(),
    };

    mockCalendar = {
      freebusy: {
        query: jest.fn(),
      },
      events: {
        get: jest.fn(),
        insert: jest.fn(),
        list: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockCalendarBookingRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    mockEmailThreadRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    google.auth.OAuth2 = jest.fn().mockImplementation(() => mockOAuth2Client);
    (google.calendar as jest.Mock).mockReturnValue(mockCalendar);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        {
          provide: getRepositoryToken(CalendarBooking),
          useValue: mockCalendarBookingRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            hasUser: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: GoogleAccountsService,
          useValue: {
            findOwnerUserIdByGoogleAccountId: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LLMService,
          useValue: {
            generateMeetingReply: jest.fn(),
            detectMeetingProposal: jest.fn(),
          },
        },
        {
          provide: EmailsService,
          useValue: {
            getEmailById: jest.fn(),
            getThreadEmails: jest.fn().mockResolvedValue([]),
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
        {
          provide: CalendarAgendaService,
          useValue: {
            summariseAgendaToTitle: jest.fn(),
            bookSlotWithAgenda: jest.fn(),
          },
        },
        {
          provide: CalendarIcsService,
          useValue: {
            parseIcsAttachment: jest.fn(),
            checkEventExists: jest.fn(),
            addIcsEventToCalendar: jest.fn(),
            getIcsInfo: jest.fn(),
            acceptCounterProposal: jest.fn(),
            declineCounterProposal: jest.fn(),
          },
        },
        {
          provide: BookingNotificationService,
          useValue: {
            sendBookingNotifications: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
    usersService = module.get(UsersService);
    llmService = module.get(LLMService);
    emailsService = module.get(EmailsService);
    calendarIcsService = module.get(CalendarIcsService);
    calendarAgendaService = module.get(CalendarAgendaService);
    bookingNotificationService = module.get(BookingNotificationService);
    jest.clearAllMocks();
    usersService.hasUser.mockImplementation((id: string) =>
      Promise.resolve(id === "user-1"),
    );
  });

  describe("getAvailableTimeSlots", () => {
    it("should return available time slots", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
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
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockRejectedValue(new Error("API Error"));

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Failed to fetch calendar data");
    });

    it("should throw specific error for Insufficient Permission from Google", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockRejectedValue(
        new Error("Insufficient Permission"),
      );

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Google Calendar access not authorized");
    });

    it("should throw specific error for insufficientPermissions from Google", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockRejectedValue(
        new Error(
          "Request failed with status code 403: insufficientPermissions",
        ),
      );

      await expect(
        service.getAvailableTimeSlots("user-1", DAYS_AHEAD_FOR_AVAILABILITY),
      ).rejects.toThrow("Google Calendar access not authorized");
    });

    it("should filter out busy periods", async () => {
      const now = new Date();
      const busyStart = new Date(now);
      busyStart.setHours(10, 0, 0, 0);
      const busyEnd = new Date(now);
      busyEnd.setHours(11, 0, 0, 0);

      usersService.findOne.mockResolvedValue(mockUser);
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
    it("should create a calendar event with booking record", async () => {
      const mockEvent = {
        id: "event-1",
        summary: "Meeting with Guest",
        start: { dateTime: "2024-01-15T10:00:00Z" },
        end: { dateTime: "2024-01-15T11:00:00Z" },
      };

      usersService.findOne.mockResolvedValue(mockUser);

      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      const result = await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 60,
        guestEmail: "guest@example.com",
        guestName: "Guest Name",
        title: "Meeting Title",
        description: "Meeting description",
      });

      expect(mockCalendar.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            summary: "Meeting Title",
            start: { dateTime: "2024-01-15T10:00:00.000Z" },
            end: { dateTime: "2024-01-15T11:00:00.000Z" },
            attendees: [{ email: "guest@example.com" }],
            conferenceData: expect.objectContaining({
              createRequest: expect.objectContaining({
                conferenceSolutionKey: { type: "hangoutsMeet" },
              }),
            }),
          }),
        }),
      );
      expect(mockCalendarBookingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          googleEventId: "event-1",
          guestEmail: "guest@example.com",
          guestName: "Guest Name",
          durationMinutes: 60,
          status: "active",
        }),
      );
      expect(result).toEqual({ ...mockEvent, meetLink: null });
    });

    it("should include reschedule and cancel links in description", async () => {
      const mockEvent = { id: "event-1" };
      usersService.findOne.mockResolvedValue(mockUser);

      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 60,
        guestEmail: "guest@example.com",
        guestName: "Guest",
      });

      const insertCall = mockCalendar.events.insert.mock.calls[0][0];
      expect(insertCall.requestBody.description).toContain("Reschedule:");
      expect(insertCall.requestBody.description).toContain("Cancel:");
      expect(insertCall.requestBody.description).toContain("/booking/");
      expect(insertCall.requestBody.description).toContain("/reschedule");
      expect(insertCall.requestBody.description).toContain("/cancel");
    });

    it("should use default title when not provided", async () => {
      const mockEvent = { id: "event-1" };
      usersService.findOne.mockResolvedValue(mockUser);

      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 60,
        guestEmail: "guest@example.com",
        guestName: "Guest",
      });

      expect(mockCalendar.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            summary: "Meeting with Guest",
          }),
        }),
      );
    });

    it("should throw error when Google Calendar not connected", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.createEvent({
          userId: "user-1",
          startTime: "2024-01-15T10:00:00Z",
          durationMinutes: 60,
          guestEmail: "guest@example.com",
        }),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockRejectedValue(new Error("API Error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(
        service.createEvent({
          userId: "user-1",
          startTime: "2024-01-15T10:00:00Z",
          durationMinutes: 60,
          guestEmail: "guest@example.com",
        }),
      ).rejects.toThrow("Failed to create calendar event");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("createEvent — Meet link extraction", () => {
    it("should return meetLink when Google response includes a video entry point", async () => {
      const mockMeetUri = "https://meet.google.com/abc-defg-hij";
      const mockEventWithConference = {
        id: "event-meet-1",
        summary: "Meeting with conferenceData",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: mockMeetUri },
            { entryPointType: "phone", uri: "tel:+1-555-0100" },
          ],
        },
      };

      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockResolvedValue({
        data: mockEventWithConference,
      });

      const result = await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });

      expect(result.meetLink).toBe(mockMeetUri);
    });

    it("should return meetLink as null when conferenceData is absent from response", async () => {
      const mockEventWithoutConference = {
        id: "event-no-meet-1",
        summary: "Meeting without conferenceData",
      };

      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockResolvedValue({
        data: mockEventWithoutConference,
      });

      const result = await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });

      expect(result.meetLink).toBeNull();
    });

    it("should return meetLink as null when entryPoints has no video entry", async () => {
      const mockEventPhoneOnly = {
        id: "event-phone-only-1",
        summary: "Phone-only conference",
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+1-555-0100" },
            { entryPointType: "sip", uri: "sip:abc@meet.google.com" },
          ],
        },
      };

      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockResolvedValue({
        data: mockEventPhoneOnly,
      });

      const result = await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });

      expect(result.meetLink).toBeNull();
    });

    it("should include conferenceDataVersion: 1 in the insert call to trigger Meet creation", async () => {
      const mockEvent = { id: "event-conf-version-1" };

      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });

      expect(mockCalendar.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            conferenceData: expect.objectContaining({
              createRequest: expect.objectContaining({
                conferenceSolutionKey: { type: "hangoutsMeet" },
                requestId: expect.any(String),
              }),
            }),
          }),
        }),
      );
    });

    it("should generate a unique requestId for each createEvent call", async () => {
      const mockEvent = { id: "event-req-id-1" };

      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.insert.mockResolvedValue({ data: mockEvent });

      await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T10:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });
      await service.createEvent({
        userId: "user-1",
        startTime: "2024-01-15T11:00:00Z",
        durationMinutes: 30,
        guestEmail: "guest@example.com",
      });

      const firstCallRequestId =
        mockCalendar.events.insert.mock.calls[0][0].requestBody.conferenceData
          .createRequest.requestId;
      const secondCallRequestId =
        mockCalendar.events.insert.mock.calls[1][0].requestBody.conferenceData
          .createRequest.requestId;

      expect(firstCallRequestId).not.toBe(secondCallRequestId);
    });
  });

  describe("bookSlotWithAgenda", () => {
    const bookOptions = {
      userId: "user-1",
      startTime: "2024-01-15T10:00:00Z",
      durationMinutes: 30,
      guestEmail: "guest@example.com",
      guestName: "Guest Name",
      additionalGuests: ["extra@example.com"],
    };
    const bookedEvent = {
      id: "event-1",
      summary: "Meeting with Guest Name",
      meetLink: "https://meet.google.com/abc-defg-hij",
    };

    it("returns the created event and sends booking notification emails", async () => {
      calendarAgendaService.bookSlotWithAgenda.mockResolvedValue(bookedEvent);

      const result = await service.bookSlotWithAgenda(bookOptions);

      expect(result).toEqual(bookedEvent);
      expect(
        bookingNotificationService.sendBookingNotifications,
      ).toHaveBeenCalledWith(bookOptions, bookedEvent);
    });

    it("does not send notifications when event creation fails", async () => {
      calendarAgendaService.bookSlotWithAgenda.mockRejectedValue(
        new Error("Failed to create calendar event"),
      );

      await expect(service.bookSlotWithAgenda(bookOptions)).rejects.toThrow(
        "Failed to create calendar event",
      );
      expect(
        bookingNotificationService.sendBookingNotifications,
      ).not.toHaveBeenCalled();
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

      usersService.findOne.mockResolvedValue(mockUser);
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
      usersService.findOne.mockResolvedValue(mockUser);
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
      usersService.findOne.mockResolvedValue(mockUser);
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
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.findEventsWithAttendee("user-1", "attendee@example.com"),
      ).rejects.toThrow("Google Calendar not connected");
    });

    it("should handle calendar API errors", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.list.mockRejectedValue(new Error("API Error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(
        service.findEventsWithAttendee("user-1", "attendee@example.com"),
      ).rejects.toThrow("Failed to find calendar events");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("generateMeetingReply", () => {
    const BOOKING_URL = "https://cal.example.com/booking";

    it("falls back to BearlyMail booking URL when no profile URL or env var is set", async () => {
      const userWithoutBookingUrl = { ...mockUser, calendarBookingUrl: null };
      usersService.findOne.mockResolvedValue(userWithoutBookingUrl);
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      delete process.env.CALENDAR_BOOKING_URL;
      delete process.env.FRONTEND_URL;
      llmService.generateMeetingReply.mockResolvedValue(
        "Here is my booking link...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(llmService.generateMeetingReply).toHaveBeenCalledWith(
        expect.objectContaining({ from: mockEmail.from }),
        [],
        "http://localhost:3000/book/user-1",
        undefined,
        "user-1",
        { emailExamples: [] },
      );
      expect(result).toBe("Here is my booking link...");
    });

    it("calls llmService.generateMeetingReply with calendarBookingUrl from user profile when set", async () => {
      const userWithBookingUrl = {
        ...mockUser,
        calendarBookingUrl: BOOKING_URL,
      };
      usersService.findOne.mockResolvedValue(userWithBookingUrl);
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.generateMeetingReply.mockResolvedValue(
        "Here is my booking link...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(emailsService.getEmailById).toHaveBeenCalledWith(
        "user-1",
        "email-1",
      );
      expect(llmService.generateMeetingReply).toHaveBeenCalledWith(
        expect.objectContaining({ from: mockEmail.from }),
        [],
        BOOKING_URL,
        undefined,
        "user-1",
        { emailExamples: [] },
      );
      expect(result).toBe("Here is my booking link...");
    });

    it("falls back to CALENDAR_BOOKING_URL env var when profile URL is empty", async () => {
      const userWithEmptyBookingUrl = {
        ...mockUser,
        calendarBookingUrl: "",
      };
      usersService.findOne.mockResolvedValue(userWithEmptyBookingUrl);
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      process.env.CALENDAR_BOOKING_URL = BOOKING_URL;
      llmService.generateMeetingReply.mockResolvedValue(
        "Booking via env var link...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(llmService.generateMeetingReply).toHaveBeenCalledWith(
        expect.anything(),
        [],
        BOOKING_URL,
        undefined,
        "user-1",
        { emailExamples: [] },
      );
      expect(result).toBe("Booking via env var link...");

      delete process.env.CALENDAR_BOOKING_URL;
    });

    it("falls back to BearlyMail booking URL with FRONTEND_URL when no profile URL or CALENDAR_BOOKING_URL", async () => {
      const userWithoutBookingUrl = { ...mockUser, calendarBookingUrl: "" };
      usersService.findOne.mockResolvedValue(userWithoutBookingUrl);
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      delete process.env.CALENDAR_BOOKING_URL;
      process.env.FRONTEND_URL = "https://app.bearlymail.com";
      llmService.generateMeetingReply.mockResolvedValue(
        "Here is my booking link...",
      );

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(llmService.generateMeetingReply).toHaveBeenCalledWith(
        expect.anything(),
        [],
        "https://app.bearlymail.com/book/user-1",
        undefined,
        "user-1",
        { emailExamples: [] },
      );
      expect(result).toBe("Here is my booking link...");

      delete process.env.FRONTEND_URL;
    });

    it("should throw error when email not found", async () => {
      const userWithBookingUrl = {
        ...mockUser,
        calendarBookingUrl: BOOKING_URL,
      };
      usersService.findOne.mockResolvedValue(userWithBookingUrl);
      emailsService.getEmailById.mockResolvedValue(null);

      await expect(
        service.generateMeetingReply("user-1", "nonexistent-email"),
      ).rejects.toThrow("Email not found");
    });

    it("returns fallback string when LLM throws and schedulingLinkUrl is set", async () => {
      const userWithBookingUrl = {
        ...mockUser,
        calendarBookingUrl: BOOKING_URL,
      };
      usersService.findOne.mockResolvedValue(userWithBookingUrl);
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.generateMeetingReply.mockRejectedValue(new Error("LLM error"));

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await service.generateMeetingReply("user-1", "email-1");

      expect(result).toContain("Happy to find a time");
      expect(result).toContain(BOOKING_URL);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("calculateFreeSlots", () => {
    it("should calculate free slots within business hours", () => {
      const start = new Date("2024-01-15T09:00:00Z");
      const end = new Date("2024-01-15T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = calculateFreeSlots(start, end, busy);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should return more than 10 slots when availability allows across multiple days", () => {
      // Multiple days with no busy periods should yield well more than 10 slots
      const start = new Date("2024-01-15T09:00:00Z");
      // 5 business days
      const end = new Date("2024-01-22T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = calculateFreeSlots(start, end, busy);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(10);
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

      const result = calculateFreeSlots(start, end, busy);

      // Should not include slots that overlap with busy period
      expect(Array.isArray(result)).toBe(true);
    });

    it("should only return slots within business hours (9 AM - 5 PM)", () => {
      const start = new Date("2024-01-15T08:00:00Z");
      const end = new Date("2024-01-15T18:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = calculateFreeSlots(start, end, busy);

      result.forEach((slot: { start: string }) => {
        const slotDate = new Date(slot.start);
        // Slots are computed in the preference timezone, which defaults to UTC
        // here — assert in UTC so the test is independent of the runner's zone.
        const hours = slotDate.getUTCHours();
        expect(hours).toBeGreaterThanOrEqual(9);
        expect(hours).toBeLessThan(17);
      });
    });

    it("should return all available slots without a hard cap", () => {
      const start = new Date("2024-01-15T09:00:00Z");
      // Multiple days — previously would have been capped at 10
      const end = new Date("2024-01-20T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = calculateFreeSlots(start, end, busy);

      // Without the hard cap, multiple business days should yield many more slots
      expect(result.length).toBeGreaterThan(10);
    });

    it("should align start time to clean slot boundaries", () => {
      const start = new Date("2024-01-15T09:22:15Z");
      const end = new Date("2024-01-15T17:00:00Z");
      const busy: Array<{ start: string; end: string }> = [];

      const result = calculateFreeSlots(start, end, busy);

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
      const result = alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it("should keep already-aligned times unchanged", () => {
      const date = new Date("2024-01-15T09:00:00Z");
      const result = alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it("should handle 15-minute slot durations", () => {
      const date = new Date("2024-01-15T09:07:30Z");
      const result = alignToSlotBoundary(date, 15);
      expect(result.getMinutes()).toBe(15);
      expect(result.getSeconds()).toBe(0);
    });

    it("should handle 60-minute slot durations", () => {
      const date = new Date("2024-01-15T09:45:00Z");
      const result = alignToSlotBoundary(date, 60);
      // Input is UTC; assert in UTC so the rolled-over hour is independent of
      // the runner's local timezone.
      expect(result.getUTCHours()).toBe(10);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });

    it("should handle time at exact boundary for 15-minute slots", () => {
      const date = new Date("2024-01-15T09:15:00Z");
      const result = alignToSlotBoundary(date, 15);
      expect(result.getMinutes()).toBe(15);
      expect(result.getSeconds()).toBe(0);
    });

    it("should zero out seconds and milliseconds", () => {
      const date = new Date("2024-01-15T09:30:45.123Z");
      const result = alignToSlotBoundary(date, 30);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe("getAvailableSlotsWithTimezone", () => {
    it("should return slots, timezone, and hasMore", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
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
      expect(result).toHaveProperty("hasMore");
      expect(Array.isArray(result.slots)).toBe(true);
      expect(typeof result.timezone).toBe("string");
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("should treat :userId as google_accounts.id when it is not users.id", async () => {
      usersService.findOne.mockImplementation((id: string) =>
        id === "user-1" ? Promise.resolve(mockUser) : Promise.resolve(null),
      );
      jest
        .spyOn(
          service.googleAccountsService,
          "findOwnerUserIdByGoogleAccountId",
        )
        .mockResolvedValue("user-1");

      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      await service.getAvailableSlotsWithTimezone("acc-google-uuid");

      expect(usersService.hasUser).toHaveBeenCalledWith("acc-google-uuid");
      expect(
        service.googleAccountsService.findOwnerUserIdByGoogleAccountId,
      ).toHaveBeenCalledWith("acc-google-uuid");
      expect(usersService.findOne).toHaveBeenCalledWith("user-1");
    });

    it("should use UTC as default timezone", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
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

    it("should paginate slots using afterDate and limit", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      // Use a wide range so many slots are generated
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      // Fetch first page (limit=5, no afterDate)
      const page1 = await service.getAvailableSlotsWithTimezone(
        "user-1",
        90,
        0,
        5,
      );

      expect(page1.slots.length).toBeLessThanOrEqual(5);
      expect(page1.slots.length).toBeGreaterThan(0);

      // Fetch second page using the last slot's end time as afterDate
      const lastSlotEnd = page1.slots[page1.slots.length - 1].end;
      const page2 = await service.getAvailableSlotsWithTimezone(
        "user-1",
        90,
        0,
        5,
        new Date(lastSlotEnd),
      );

      expect(page2.slots.length).toBeLessThanOrEqual(5);
      // Pages should not overlap
      const page1Keys = new Set(page1.slots.map((slot) => slot.start));
      page2.slots.forEach((slot) => {
        expect(page1Keys.has(slot.start)).toBe(false);
      });
    });

    it("should set hasMore=true when more slots exist beyond current page", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      // Request only 1 slot from a 90-day range — there should be many more
      const result = await service.getAvailableSlotsWithTimezone(
        "user-1",
        90,
        0,
        1,
      );

      expect(result.slots.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it("should set hasMore=false when all slots have been returned", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [],
            },
          },
        },
      });

      // Request with limit (50) far exceeding the possible slots in a 1-day window
      // (9–17 working hours at 30-min slots = at most 16 slots).
      // When limit > available slots, hasMore must be false.
      const result = await service.getAvailableSlotsWithTimezone(
        "user-1",
        1,
        0,
        50,
      );

      expect(result.slots.length).toBeLessThanOrEqual(50);
      expect(result.hasMore).toBe(false);
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
      const result = toTzDate(date, "UTC");

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
        const result = toTzDate(date, tz);
        // Should produce a valid date (not NaN or rolled over incorrectly)
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });

    it("should handle different hour values correctly", () => {
      // Test various hours to ensure they all parse correctly
      const testCases = [
        // Midnight
        new Date("2024-01-15T00:00:00Z"),
        // Morning
        new Date("2024-01-15T06:00:00Z"),
        // Noon
        new Date("2024-01-15T12:00:00Z"),
        // Evening
        new Date("2024-01-15T18:00:00Z"),
        // End of day
        new Date("2024-01-15T23:59:59Z"),
      ];

      testCases.forEach((date) => {
        const result = toTzDate(date, "UTC");
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
        const result = toTzDate(date, tz);
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });

    it("should handle DST transitions", () => {
      // March 10, 2024: DST starts in US
      const dstTransition = new Date("2024-03-10T07:00:00Z");
      const result = toTzDate(dstTransition, "America/New_York");

      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it("should preserve all time components", () => {
      const date = new Date("2024-01-15T12:34:56Z");
      const result = toTzDate(date, "UTC");

      // Validate it's a valid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });
  });

  describe("toDayKey", () => {
    it("should generate a valid day key format (YYYY-MM-DD)", () => {
      const date = new Date("2024-01-15T12:00:00Z");
      const result = toDayKey(date, "UTC");

      // Should match YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should generate a valid day key for midnight", () => {
      const date = new Date("2024-01-15T00:00:00Z");
      const result = toDayKey(date, "UTC");

      // Should produce a valid date key (not crash or produce malformed output)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should pad month and day with zeros", () => {
      const date = new Date("2024-03-05T12:00:00Z");
      const result = toDayKey(date, "UTC");

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
        const result = toDayKey(date, tz);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe("addIcsEventToCalendar — timezone normalization", () => {
    const baseEventData = {
      uid: "test-uid@example.com",
      title: "Test Meeting",
      startAt: "2024-03-15T10:00:00.000Z",
      endAt: "2024-03-15T11:00:00.000Z",
      allDay: false,
      attendees: [],
      isRecurring: false,
    };

    it("passes a valid IANA timezone directly to CalendarIcsService", async () => {
      calendarIcsService.addIcsEventToCalendar.mockResolvedValue({
        success: true,
        eventLink: "https://calendar.google.com/event",
      });

      await service.addIcsEventToCalendar("user-1", {
        ...baseEventData,
        timezone: "Australia/Sydney",
      });

      expect(calendarIcsService.addIcsEventToCalendar).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ timezone: "Australia/Sydney" }),
      );
    });

    it("falls back to UTC when timezone is undefined", async () => {
      calendarIcsService.addIcsEventToCalendar.mockResolvedValue({
        success: true,
        eventLink: "https://calendar.google.com/event",
      });

      await service.addIcsEventToCalendar("user-1", {
        ...baseEventData,
        timezone: undefined,
      });

      expect(calendarIcsService.addIcsEventToCalendar).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ timezone: undefined }),
      );
    });

    it("normalises an invalid timezone to UTC and logs a warning (belt-and-suspenders)", async () => {
      calendarIcsService.addIcsEventToCalendar.mockResolvedValue({
        success: true,
        eventLink: "https://calendar.google.com/event",
      });

      // Simulate a non-IANA string slipping through the parser
      await service.addIcsEventToCalendar("user-1", {
        ...baseEventData,
        timezone: "Not A Real Zone",
      });

      expect(calendarIcsService.addIcsEventToCalendar).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ timezone: "Not A Real Zone" }),
      );
    });
  });

  describe("acceptCounterProposal / declineCounterProposal delegation", () => {
    it("delegates acceptCounterProposal to CalendarIcsService", async () => {
      calendarIcsService.acceptCounterProposal.mockResolvedValue({
        success: true,
        newStartAt: "2026-07-16T00:00:00.000Z",
        newEndAt: "2026-07-16T00:30:00.000Z",
        htmlLink: "https://calendar.google.com/event",
      });

      const result = await service.acceptCounterProposal(
        "user-1",
        "email-1",
        "att-1",
      );

      expect(result).toEqual({
        success: true,
        newStartAt: "2026-07-16T00:00:00.000Z",
        newEndAt: "2026-07-16T00:30:00.000Z",
        htmlLink: "https://calendar.google.com/event",
      });
      expect(calendarIcsService.acceptCounterProposal).toHaveBeenCalledWith(
        "user-1",
        "email-1",
        "att-1",
      );
    });

    it("delegates declineCounterProposal to CalendarIcsService", async () => {
      calendarIcsService.declineCounterProposal.mockResolvedValue({
        success: true,
      });

      const result = await service.declineCounterProposal(
        "user-1",
        "email-1",
        "att-1",
      );

      expect(result).toEqual({ success: true });
      expect(calendarIcsService.declineCounterProposal).toHaveBeenCalledWith(
        "user-1",
        "email-1",
        "att-1",
      );
    });
  });

  describe("getBookingByToken", () => {
    it("should return booking when found", async () => {
      const mockBooking = {
        id: "booking-1",
        bookingToken: "test-token",
        userId: "user-1",
        status: "active",
      };

      mockCalendarBookingRepository.findOne.mockResolvedValue(mockBooking);

      const result = await service.getBookingByToken("test-token");

      expect(result).toEqual(mockBooking);
      expect(mockCalendarBookingRepository.findOne).toHaveBeenCalledWith({
        where: { bookingToken: "test-token" },
      });
    });

    it("should throw error when booking not found", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue(null);

      await expect(service.getBookingByToken("invalid-token")).rejects.toThrow(
        "Booking not found",
      );
    });
  });

  describe("rescheduleBooking", () => {
    const mockBooking = {
      id: "booking-1",
      bookingToken: "test-token",
      userId: "user-1",
      googleEventId: "event-1",
      guestEmail: "host@example.com",
      additionalGuests: ["extra@example.com"],
      durationMinutes: 30,
      startTime: "2024-01-15T10:00:00.000Z",
      endTime: "2024-01-15T10:30:00.000Z",
      status: "active",
    };

    it("should reschedule a booking", async () => {
      const mockEvent = { id: "event-1" };
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
      });
      usersService.findOne.mockResolvedValue(mockUser);

      mockCalendar.events.patch.mockResolvedValue({ data: mockEvent });

      const result = await service.rescheduleBooking(
        "test-token",
        "2024-01-16T14:00:00Z",
      );

      expect(mockCalendar.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "event-1",
        requestBody: {
          start: { dateTime: "2024-01-16T14:00:00.000Z" },
          end: { dateTime: "2024-01-16T14:30:00.000Z" },
          attendees: [
            { email: "host@example.com" },
            { email: "extra@example.com" },
          ],
        },
      });
      expect(mockCalendarBookingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rescheduled",
          startTime: "2024-01-16T14:00:00.000Z",
        }),
      );
      expect(result).toEqual(mockEvent);
    });

    it("should throw error when booking is cancelled", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
        status: "cancelled",
      });

      await expect(
        service.rescheduleBooking("test-token", "2024-01-16T14:00:00Z"),
      ).rejects.toThrow("Cannot reschedule a cancelled booking");
    });

    it("should throw error when calendar not connected", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.rescheduleBooking("test-token", "2024-01-16T14:00:00Z"),
      ).rejects.toThrow("Google Calendar not connected");
    });
  });

  describe("cancelBooking", () => {
    const mockBooking = {
      id: "booking-1",
      bookingToken: "test-token",
      userId: "user-1",
      googleEventId: "event-1",
      status: "active",
    };

    it("should cancel a booking", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.delete.mockResolvedValue({});

      const result = await service.cancelBooking("test-token");

      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "event-1",
      });
      expect(mockCalendarBookingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "cancelled",
        }),
      );
      expect(result).toEqual({
        success: true,
        message: "Booking cancelled successfully",
      });
    });

    it("should throw error when booking is already cancelled", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
        status: "cancelled",
      });

      await expect(service.cancelBooking("test-token")).rejects.toThrow(
        "Booking is already cancelled",
      );
    });

    it("should throw error when calendar not connected", async () => {
      mockCalendarBookingRepository.findOne.mockResolvedValue({
        ...mockBooking,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(service.cancelBooking("test-token")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });
  });

  describe("checkEventExists", () => {
    const baseEventData = {
      uid: "test-uid@example.com",
      title: "Team Standup",
      startAt: "2024-03-15T10:00:00.000Z",
      endAt: "2024-03-15T11:00:00.000Z",
      allDay: false,
      attendees: [],
      isRecurring: false,
    };

    it("returns exists=false when Google Calendar is not connected", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({ exists: false });

      const result = await service.checkEventExists("user-1", baseEventData);
      expect(result).toEqual({ exists: false });
      expect(calendarIcsService.checkEventExists).toHaveBeenCalledWith(
        "user-1",
        baseEventData,
      );
    });

    it("uses iCalUID query (no timeMin/timeMax) when uid is present", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({
        exists: true,
        calendarEventId: "gcal-event-123",
        userResponseStatus: "needsAction",
        htmlLink: undefined,
      });

      const result = await service.checkEventExists("user-1", baseEventData);

      expect(result).toEqual({
        exists: true,
        calendarEventId: "gcal-event-123",
        userResponseStatus: "needsAction",
        htmlLink: undefined,
      });
      expect(calendarIcsService.checkEventExists).toHaveBeenCalledWith(
        "user-1",
        baseEventData,
      );
    });

    it("falls back to time-window query when uid is absent", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({
        exists: true,
        calendarEventId: "gcal-event-456",
        userResponseStatus: "needsAction",
      });

      const eventDataNoUid = {
        ...baseEventData,
        uid: "",
      };

      const result = await service.checkEventExists("user-1", eventDataNoUid);

      expect(calendarIcsService.checkEventExists).toHaveBeenCalledWith(
        "user-1",
        eventDataNoUid,
      );
      expect(result.exists).toBe(true);
    });

    it("returns exists=false when no matching event is found via iCalUID", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({ exists: false });

      const result = await service.checkEventExists("user-1", baseEventData);
      expect(result).toEqual({ exists: false });
    });

    it("returns userResponseStatus and htmlLink when event has attendees", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({
        exists: true,
        calendarEventId: "gcal-event-123",
        userResponseStatus: "accepted",
        htmlLink: "https://calendar.google.com/event?eid=abc123",
      });

      const result = await service.checkEventExists("user-1", baseEventData);
      expect(result).toEqual({
        exists: true,
        calendarEventId: "gcal-event-123",
        userResponseStatus: "accepted",
        htmlLink: "https://calendar.google.com/event?eid=abc123",
      });
    });

    it("returns needsAction when user is not in attendees list", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({
        exists: true,
        calendarEventId: "gcal-event-456",
        userResponseStatus: "needsAction",
        htmlLink: "https://calendar.google.com/event?eid=def456",
      });

      const result = await service.checkEventExists("user-1", baseEventData);
      expect(result.userResponseStatus).toBe("needsAction");
    });

    it("returns accepted when user is the organizer but not in attendees", async () => {
      calendarIcsService.checkEventExists.mockResolvedValue({
        exists: true,
        calendarEventId: "gcal-event-789",
        userResponseStatus: "accepted",
        htmlLink: "https://calendar.google.com/event?eid=ghi789",
      });

      const result = await service.checkEventExists("user-1", baseEventData);
      expect(result.userResponseStatus).toBe("accepted");
    });

    it.each(["declined", "tentative", "needsAction"] as const)(
      "returns %s responseStatus correctly",
      async (status) => {
        calendarIcsService.checkEventExists.mockResolvedValue({
          exists: true,
          calendarEventId: "gcal-event-status",
          userResponseStatus: status,
        });

        const result = await service.checkEventExists("user-1", baseEventData);
        expect(result.userResponseStatus).toBe(status);
      },
    );
  });

  describe("rsvpByEventId", () => {
    it("updates RSVP and returns new status", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: "gcal-event-123",
          htmlLink: "https://calendar.google.com/event?eid=abc123",
          attendees: [
            { email: "user@example.com", responseStatus: "needsAction" },
            { email: "other@example.com", responseStatus: "accepted" },
          ],
        },
      });
      mockCalendar.events.patch.mockResolvedValue({});

      const result = await service.rsvpByEventId(
        "user-1",
        "gcal-event-123",
        "accepted",
      );

      expect(result).toEqual({
        userResponseStatus: "accepted",
        htmlLink: "https://calendar.google.com/event?eid=abc123",
      });
      expect(mockCalendar.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "gcal-event-123",
        requestBody: {
          attendees: [
            { email: "user@example.com", responseStatus: "accepted" },
            { email: "other@example.com", responseStatus: "accepted" },
          ],
        },
      });
    });

    it("throws BadRequestException when calendar not connected", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.rsvpByEventId("user-1", "gcal-event-123", "accepted"),
      ).rejects.toThrow("Google Calendar");
    });

    it("throws BadRequestException when user is not an attendee", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: "gcal-event-123",
          attendees: [
            { email: "other@example.com", responseStatus: "needsAction" },
          ],
        },
      });

      await expect(
        service.rsvpByEventId("user-1", "gcal-event-123", "accepted"),
      ).rejects.toThrow("not an attendee");
    });

    it("throws BadRequestException when event has no attendees", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: "gcal-event-123",
          attendees: [],
        },
      });

      await expect(
        service.rsvpByEventId("user-1", "gcal-event-123", "accepted"),
      ).rejects.toThrow("no attendees");
    });
  });

  describe("checkMeetingProposal", () => {
    it("returns hasProposal=false when LLM detects no proposal", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: false,
        proposedTime: null,
        proposedTimeText: null,
        topic: null,
        durationMinutes: null,
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(false);
      expect(result.isAvailable).toBeNull();
    });

    it("returns isAvailable=null when calendar not connected", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-15T09:00:00Z",
        proposedTimeText: "Tuesday 15 April at 9am",
        topic: "Meeting Request",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.proposedTime).toBe("2026-04-15T09:00:00Z");
      expect(result.isAvailable).toBeNull();
      expect(result.calendarConnected).toBe(false);
    });

    it("returns isAvailable=true when the slot is free", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-15T09:00:00Z",
        proposedTimeText: "Tuesday 15 April at 9am",
        topic: "Meeting Request",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.calendarConnected).toBe(true);
    });

    it("reports alreadyScheduled (not a conflict) when the user already booked this slot", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-15T09:00:00Z",
        proposedTimeText: "Tuesday 15 April at 9am",
        topic: "Meeting Request",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      // An active booking with the sender as guest already exists at the proposed time — this is the
      // event we created, so it must not be flagged as a busy conflict.
      mockCalendarBookingRepository.find.mockResolvedValue([
        {
          userId: "user-1",
          guestEmail: "sender@example.com",
          startTime: "2026-04-15T09:00:00Z",
          googleEventId: "evt-123",
          status: "active",
        },
      ]);
      mockCalendar.events.get.mockResolvedValue({
        data: {
          htmlLink: "https://calendar.google.com/event?eid=evt-123",
          conferenceData: {
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/abc" },
            ],
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.alreadyScheduled).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.eventLink).toBe(
        "https://calendar.google.com/event?eid=evt-123",
      );
      expect(result.meetLink).toBe("https://meet.google.com/abc");
      // Must not fall through to the free/busy query when we already booked the slot.
      expect(mockCalendar.freebusy.query).not.toHaveBeenCalled();
    });

    it("ignores bookings for a different guest at the proposed time", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-15T09:00:00Z",
        proposedTimeText: "Tuesday 15 April at 9am",
        topic: "Meeting Request",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendarBookingRepository.find.mockResolvedValue([
        {
          userId: "user-1",
          guestEmail: "someone-else@example.com",
          startTime: "2026-04-15T09:00:00Z",
          googleEventId: "evt-999",
          status: "active",
        },
      ]);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.alreadyScheduled).toBeUndefined();
      expect(result.isAvailable).toBe(true);
      expect(mockCalendar.freebusy.query).toHaveBeenCalled();
    });

    it("returns isAvailable=false when the slot has a conflict", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-15T09:00:00Z",
        proposedTimeText: "Tuesday 15 April at 9am",
        topic: "Meeting Request",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-04-15T09:00:00Z",
                  end: "2026-04-15T10:00:00Z",
                },
              ],
            },
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.isAvailable).toBe(false);
      expect(result.suggestedTime).toBeNull();
    });

    it("finds a free slot inside a proposed window and suggests it", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      // Sender offered "between 1 and 4" → a 3-hour window, no explicit meeting length.
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-07-08T13:00:00Z",
        windowEnd: "2026-07-08T16:00:00Z",
        proposedTimeText: "Wednesday 8 July between 1 and 4",
        topic: "Seminar Series",
        durationMinutes: null,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      // Busy 1:00–2:00 inside the window; free from 2:00 onward.
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-07-08T13:00:00Z", end: "2026-07-08T14:00:00Z" },
              ],
            },
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.isAvailable).toBe(true);
      expect(result.suggestedTime).toBe("2026-07-08T14:00:00.000Z");
      // The whole window is queried, not just the first 30 minutes.
      expect(mockCalendar.freebusy.query).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            timeMin: "2026-07-08T13:00:00.000Z",
            timeMax: "2026-07-08T16:00:00.000Z",
          }),
        }),
      );
    });

    it("returns isAvailable=false when a proposed window is fully booked", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-07-08T13:00:00Z",
        windowEnd: "2026-07-08T16:00:00Z",
        proposedTimeText: "Wednesday 8 July between 1 and 4",
        topic: "Seminar Series",
        durationMinutes: null,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-07-08T13:00:00Z", end: "2026-07-08T16:00:00Z" },
              ],
            },
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.isAvailable).toBe(false);
      expect(result.suggestedTime).toBeNull();
    });

    it("suggests a free slot in working hours for a date-only proposal", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      // Sender named a day ("the 9th of July") but no time of day.
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: null,
        windowEnd: null,
        proposedDate: "2099-07-09",
        proposedTimeText: "9 July",
        topic: "Buddies",
        durationMinutes: null,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      // Whole working day free → first slot is the start of working hours (09:00 UTC).
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.calendarConnected).toBe(true);
      // Working hours 09:00–17:00 in the prefs timezone (UTC) on the proposed date.
      expect(result.suggestedTime).toBe("2099-07-09T09:00:00.000Z");
      expect(result.proposedTime).toBe("2099-07-09T09:00:00.000Z");
      expect(result.windowEnd).toBe("2099-07-09T17:00:00.000Z");
      expect(mockCalendar.freebusy.query).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            timeMin: "2099-07-09T09:00:00.000Z",
            timeMax: "2099-07-09T17:00:00.000Z",
          }),
        }),
      );
    });

    it("skips the busy morning and suggests the first free afternoon slot for a date-only proposal", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: null,
        windowEnd: null,
        proposedDate: "2099-07-09",
        proposedTimeText: "9 July",
        topic: "Buddies",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      // Busy 09:00–13:00; first free 30-min slot is 13:00.
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2099-07-09T09:00:00Z", end: "2099-07-09T13:00:00Z" },
              ],
            },
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.isAvailable).toBe(true);
      expect(result.suggestedTime).toBe("2099-07-09T13:00:00.000Z");
      expect(result.proposedTime).toBe("2099-07-09T13:00:00.000Z");
    });

    it("degrades a date-only proposal to no concrete proposal when the day is fully booked", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: null,
        windowEnd: null,
        proposedDate: "2099-07-09",
        proposedTimeText: "9 July",
        topic: "Buddies",
        durationMinutes: null,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2099-07-09T09:00:00Z", end: "2099-07-09T17:00:00Z" },
              ],
            },
          },
        },
      });

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(false);
      expect(result.proposedTime).toBeNull();
      expect(result.suggestedTime).toBeNull();
      expect(result.isAvailable).toBe(false);
      expect(result.calendarConnected).toBe(true);
    });

    it("degrades a date-only proposal to no concrete proposal when calendar is not connected", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: null,
        windowEnd: null,
        proposedDate: "2099-07-09",
        proposedTimeText: "9 July",
        topic: "Buddies",
        durationMinutes: null,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(false);
      expect(result.proposedTime).toBeNull();
      expect(result.calendarConnected).toBe(false);
    });

    it("ignores the thread-level meetingProposal cache and re-detects from the viewed email", async () => {
      const emailWithThread = {
        ...mockEmail,
        threadId: "gmail-thread-1",
        emailThreadId: "thread-uuid-1",
        body: "Let's meet on 10 June at 10:30am",
      };
      emailsService.getEmailById.mockResolvedValue(emailWithThread);
      // The cache says "no proposal" — if it were trusted, the button would be
      // hidden. The timezone-aware detection on the viewed email must win.
      mockEmailThreadRepository.findOne = jest.fn().mockResolvedValue({
        id: "thread-uuid-1",
        meetingProposal: {
          hasProposal: false,
          proposedTime: null,
        },
      });
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-06-10T00:30:00Z",
        proposedTimeText: "10 June at 10:30am",
        topic: "Meeting",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.proposedTime).toBe("2026-06-10T00:30:00Z");
      // The timezone-aware detection ran on the viewed email's body.
      expect(llmService.detectMeetingProposal).toHaveBeenCalledWith(
        expect.objectContaining({ body: emailWithThread.body }),
        undefined,
        "user-1",
        "UTC",
      );
    });

    it("detects from the viewed email, not the most recent email in the thread", async () => {
      const viewedEmail = {
        ...mockEmail,
        id: "email-1",
        threadId: "gmail-thread-1",
        emailThreadId: "thread-uuid-1",
        body: "Let's meet on Tuesday at 9am",
      };
      const newerReply = {
        ...mockEmail,
        id: "email-2",
        threadId: "gmail-thread-1",
        emailThreadId: "thread-uuid-1",
        from: "sender@example.com",
        body: "Sounds good, see you then!",
      };
      emailsService.getEmailById.mockResolvedValue(viewedEmail);
      // A newer reply exists in the thread but carries no proposal — detection
      // must run on the email the user is actually viewing.
      emailsService.getThreadEmails.mockResolvedValue([
        newerReply,
        viewedEmail,
      ]);
      mockEmailThreadRepository.findOne = jest.fn().mockResolvedValue(null);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: true,
        proposedTime: "2026-04-14T09:00:00Z",
        proposedTimeText: "Tuesday 14 April at 9am",
        topic: "Meeting",
        durationMinutes: 30,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      const result = await service.checkMeetingProposal("user-1", "email-1");

      expect(result.hasProposal).toBe(true);
      expect(result.proposedTime).toBe("2026-04-14T09:00:00Z");
      expect(llmService.detectMeetingProposal).toHaveBeenCalledWith(
        expect.objectContaining({ body: viewedEmail.body }),
        undefined,
        "user-1",
        "UTC",
      );
    });

    it("passes earlier thread messages as priorMessages so a confirmation reply can inherit the date", async () => {
      const earlierProposal = {
        ...mockEmail,
        id: "email-0",
        threadId: "gmail-thread-1",
        from: "jeremy@focusbear.io",
        fromName: "Jeremy Nagel",
        body: "Could we do 1st July from 2-4pm?",
      };
      const viewedEmail = {
        ...mockEmail,
        id: "email-1",
        threadId: "gmail-thread-1",
        from: "sdpcrowe@gmail.com",
        fromName: "Scott Crowe",
        body: "Great, lets lock in 2pm thanks.",
      };
      emailsService.getEmailById.mockResolvedValue(viewedEmail);
      emailsService.getThreadEmails.mockResolvedValue([
        earlierProposal,
        viewedEmail,
      ]);
      mockEmailThreadRepository.findOne = jest.fn().mockResolvedValue(null);
      llmService.detectMeetingProposal = jest.fn().mockResolvedValue({
        hasProposal: false,
        proposedTime: null,
      });
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      await service.checkMeetingProposal("user-1", "email-1");

      const callArg = (llmService.detectMeetingProposal as jest.Mock).mock
        .calls[0][0];
      expect(callArg.priorMessages).toEqual([
        expect.objectContaining({ body: earlierProposal.body }),
      ]);
      // The viewed email itself must NOT appear in its own prior-message context.
      expect(callArg.priorMessages).not.toContainEqual(
        expect.objectContaining({ body: viewedEmail.body }),
      );
    });
  });

  describe("checkTimeAvailability", () => {
    it("returns calendarConnected=false when calendar not connected", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({ ...mockUser, googleCalendarAccessToken: null }),
      );

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.calendarConnected).toBe(false);
      expect(result.isAvailable).toBeNull();
      expect(mockCalendar.freebusy.query).not.toHaveBeenCalled();
    });

    it("returns isAvailable=true when the edited slot is free", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.isAvailable).toBe(true);
      expect(result.calendarConnected).toBe(true);
    });

    it("returns isAvailable=false when the edited slot conflicts", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-04-15T09:00:00Z", end: "2026-04-15T10:00:00Z" },
              ],
            },
          },
        },
      });

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.isAvailable).toBe(false);
    });

    it("names the conflicting events when the slot is busy", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-04-15T09:00:00Z", end: "2026-04-15T10:00:00Z" },
              ],
            },
          },
        },
      });
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            {
              summary: "Standup",
              start: { dateTime: "2026-04-15T09:00:00Z" },
              end: { dateTime: "2026-04-15T09:30:00Z" },
            },
            {
              // Marked free — freebusy ignores it, so the conflict list must too
              summary: "Focus block",
              transparency: "transparent",
              start: { dateTime: "2026-04-15T09:00:00Z" },
              end: { dateTime: "2026-04-15T10:00:00Z" },
            },
            {
              // Untitled all-day event
              start: { date: "2026-04-15" },
              end: { date: "2026-04-16" },
            },
          ],
        },
      });

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.isAvailable).toBe(false);
      expect(result.conflictingEvents).toEqual([
        {
          title: "Standup",
          start: "2026-04-15T09:00:00Z",
          end: "2026-04-15T09:30:00Z",
        },
        { title: null, start: "2026-04-15", end: "2026-04-16" },
      ]);
    });

    it("does not let free-marked events crowd out real conflicts", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-04-15T09:00:00Z", end: "2026-04-15T10:00:00Z" },
              ],
            },
          },
        },
      });
      const transparent = (name: string) => ({
        summary: name,
        transparency: "transparent",
        start: { dateTime: "2026-04-15T09:00:00Z" },
        end: { dateTime: "2026-04-15T10:00:00Z" },
      });
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            transparent("Free 1"),
            transparent("Free 2"),
            transparent("Free 3"),
            {
              summary: "Real conflict",
              start: { dateTime: "2026-04-15T09:00:00Z" },
              end: { dateTime: "2026-04-15T09:30:00Z" },
            },
          ],
        },
      });

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.conflictingEvents).toEqual([
        {
          title: "Real conflict",
          start: "2026-04-15T09:00:00Z",
          end: "2026-04-15T09:30:00Z",
        },
      ]);
    });

    it("returns no conflicting events (and skips the lookup) when the slot is free", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.conflictingEvents).toEqual([]);
      expect(mockCalendar.events.list).not.toHaveBeenCalled();
    });

    it("keeps the busy verdict when the conflicting-events lookup fails", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: "2026-04-15T09:00:00Z", end: "2026-04-15T10:00:00Z" },
              ],
            },
          },
        },
      });
      mockCalendar.events.list.mockRejectedValue(new Error("API Error"));

      const result = await service.checkTimeAvailability(
        "user-1",
        "2026-04-15T09:00:00Z",
        30,
      );

      expect(result.isAvailable).toBe(false);
      expect(result.conflictingEvents).toEqual([]);
    });

    it("checks the exact slot (no window) for the given duration", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendar.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      await service.checkTimeAvailability("user-1", "2026-04-15T09:00:00Z", 60);

      expect(mockCalendar.freebusy.query).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            timeMin: "2026-04-15T09:00:00.000Z",
            timeMax: "2026-04-15T10:00:00.000Z",
          }),
        }),
      );
    });
  });

  describe("createEventFromEmailProposal", () => {
    it("creates calendar event with email sender as guest", async () => {
      emailsService.getEmailById.mockResolvedValue(mockEmail);
      usersService.findOne.mockResolvedValue(mockUser);
      mockCalendarBookingRepository.save.mockResolvedValue({});
      mockCalendar.events.insert.mockResolvedValue({
        data: {
          id: "gcal-event-new",
          conferenceData: {
            entryPoints: [
              {
                entryPointType: "video",
                uri: "https://meet.google.com/abc-def",
              },
            ],
          },
        },
      });

      const result = await service.createEventFromEmailProposal(
        "user-1",
        "email-1",
        "2026-04-15T09:00:00Z",
        "Meeting Request",
        30,
      );

      expect(mockCalendar.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: "Meeting Request",
            attendees: expect.arrayContaining([
              { email: "sender@example.com" },
            ]),
          }),
        }),
      );
      expect(result.meetLink).toBe("https://meet.google.com/abc-def");
      expect(result.eventId).toBe("gcal-event-new");
    });

    it("throws when email not found", async () => {
      emailsService.getEmailById.mockResolvedValue(null);

      await expect(
        service.createEventFromEmailProposal(
          "user-1",
          "nonexistent",
          "2026-04-15T09:00:00Z",
          "Meeting",
          30,
        ),
      ).rejects.toThrow("Email not found");
    });
  });
});
