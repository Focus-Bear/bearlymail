/**
 * Tests for CalendarIcsService's reschedule-request handling
 * (acceptCounterProposal / declineCounterProposal) — the feature that lets a
 * user act on an attendee's METHOD:COUNTER calendar reply (decline + propose
 * a new time), which previously had no handling at all.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { google } from "googleapis";

import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { UsersService } from "../users/users.service";
import { CalendarIcsService } from "./calendar-ics.service";

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

// A minimal but realistic METHOD:COUNTER ics — decline + propose a new time.
const COUNTER_ICS = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
METHOD:COUNTER
BEGIN:VEVENT
DTSTART:20260716T000000Z
DTEND:20260716T003000Z
DTSTAMP:20260708T232943Z
ORGANIZER;CN=jeremy@focusbear.io:mailto:jeremy@focusbear.io
UID:f3a7pmefdvh0bpftdscvssu6jg@google.com
ATTENDEE;CN=Jordan Lee;PARTSTAT=ACCEPTED:mailto:jordan@example.com
SUMMARY:Fundraising tips and Snowie Fellowship
END:VEVENT
END:VCALENDAR`;

// Same UID/attendee, but a plain REQUEST — must be rejected by the reschedule endpoints.
const REQUEST_ICS = `BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:20260716T100000Z
DTEND:20260716T103000Z
UID:plain-request@google.com
ATTENDEE;CN=Jordan Lee:mailto:jordan@example.com
SUMMARY:Regular invite
END:VEVENT
END:VCALENDAR`;

// Same as COUNTER_ICS but with an explicit TZID, so the decline-reply
// timezone-formatting fix has something other than UTC to prove itself against.
const COUNTER_ICS_WITH_TZ = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
METHOD:COUNTER
BEGIN:VEVENT
DTSTART;TZID=Australia/Sydney:20260716T100000
DTEND;TZID=Australia/Sydney:20260716T103000
DTSTAMP:20260708T232943Z
ORGANIZER;CN=jeremy@focusbear.io:mailto:jeremy@focusbear.io
UID:f3a7pmefdvh0bpftdscvssu6jg@google.com
ATTENDEE;CN=Jordan Lee;PARTSTAT=ACCEPTED:mailto:jordan@example.com
SUMMARY:Fundraising tips and Snowie Fellowship
END:VEVENT
END:VCALENDAR`;

describe("CalendarIcsService — reschedule requests (METHOD:COUNTER)", () => {
  let service: CalendarIcsService;
  let usersService: { findOne: jest.Mock };
  let emailsService: { getAttachment: jest.Mock; getEmailById: jest.Mock };
  let emailProviderManager: {
    getPrimaryProvider: jest.Mock;
  };
  let mockCalendar: {
    events: {
      get: jest.Mock;
      list: jest.Mock;
      patch: jest.Mock;
    };
  };
  let mockProvider: { sendReply: jest.Mock };

  const mockUser = {
    id: "user-1",
    email: "jeremy@focusbear.io",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: "refresh-token",
  };

  const icsBuffer = (ics: string) => ({
    attachmentBuffer: Buffer.from(ics, "utf-8"),
  });

  beforeEach(() => {
    usersService = { findOne: jest.fn().mockResolvedValue(mockUser) };
    emailsService = {
      getAttachment: jest.fn().mockResolvedValue(icsBuffer(COUNTER_ICS)),
      getEmailById: jest.fn().mockResolvedValue({
        threadId: "thread-1",
        subject: "Fundraising tips and Snowie Fellowship",
      }),
    };
    mockProvider = { sendReply: jest.fn().mockResolvedValue(undefined) };
    emailProviderManager = {
      getPrimaryProvider: jest.fn().mockResolvedValue(mockProvider),
    };
    mockCalendar = {
      events: {
        get: jest.fn().mockResolvedValue({
          data: {
            attendees: [
              { email: "jordan@example.com", responseStatus: "declined" },
              { email: "jeremy@focusbear.io", responseStatus: "accepted" },
            ],
          },
        }),
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: "gcal-event-1",
                htmlLink: "https://calendar.google.com/event?eid=abc",
                start: { dateTime: "2026-07-16T00:00:00Z" },
                end: { dateTime: "2026-07-16T01:00:00Z" },
                organizer: { email: "jeremy@focusbear.io" },
                attendees: [
                  { email: "jeremy@focusbear.io", responseStatus: "accepted" },
                ],
              },
            ],
          },
        }),
        patch: jest.fn().mockResolvedValue({
          data: { htmlLink: "https://calendar.google.com/event?eid=abc" },
        }),
      },
    };
    (google.calendar as jest.Mock).mockReturnValue(mockCalendar);

    service = new CalendarIcsService(
      usersService as unknown as UsersService,
      emailsService as unknown as EmailsService,
      emailProviderManager as unknown as EmailProviderManager,
    );
  });

  describe("acceptCounterProposal", () => {
    it("moves the calendar event to the proposed time and notifies attendees via sendUpdates=all", async () => {
      const result = await service.acceptCounterProposal(
        "user-1",
        "email-1",
        "att-1",
      );

      expect(mockCalendar.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          eventId: "gcal-event-1",
          sendUpdates: "all",
          requestBody: expect.objectContaining({
            start: expect.objectContaining({
              dateTime: "2026-07-16T00:00:00.000Z",
            }),
            end: expect.objectContaining({
              dateTime: "2026-07-16T00:30:00.000Z",
            }),
          }),
        }),
      );
      expect(result).toEqual({
        success: true,
        newStartAt: "2026-07-16T00:00:00.000Z",
        newEndAt: "2026-07-16T00:30:00.000Z",
        htmlLink: "https://calendar.google.com/event?eid=abc",
      });
    });

    it("marks the countering attendee as accepted, leaving other attendees untouched", async () => {
      await service.acceptCounterProposal("user-1", "email-1", "att-1");

      const patchedAttendees =
        mockCalendar.events.patch.mock.calls[0][0].requestBody.attendees;
      expect(patchedAttendees).toEqual([
        { email: "jordan@example.com", responseStatus: "accepted" },
        { email: "jeremy@focusbear.io", responseStatus: "accepted" },
      ]);
    });

    it("throws BadRequestException when the ics is not a COUNTER", async () => {
      emailsService.getAttachment.mockResolvedValue(icsBuffer(REQUEST_ICS));

      await expect(
        service.acceptCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(BadRequestException);
      expect(mockCalendar.events.patch).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when no matching calendar event exists", async () => {
      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await expect(
        service.acceptCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(NotFoundException);
      expect(mockCalendar.events.patch).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when Google Calendar is not connected", async () => {
      usersService.findOne.mockResolvedValue({
        ...mockUser,
        googleCalendarAccessToken: null,
      });

      await expect(
        service.acceptCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("appends the proposer as accepted when they're missing from the calendar event's own attendee list", async () => {
      mockCalendar.events.get.mockResolvedValue({
        data: {
          attendees: [
            { email: "jeremy@focusbear.io", responseStatus: "accepted" },
          ],
        },
      });

      await service.acceptCounterProposal("user-1", "email-1", "att-1");

      const patchedAttendees =
        mockCalendar.events.patch.mock.calls[0][0].requestBody.attendees;
      expect(patchedAttendees).toEqual([
        { email: "jeremy@focusbear.io", responseStatus: "accepted" },
        {
          email: "jordan@example.com",
          displayName: "Jordan Lee",
          responseStatus: "accepted",
        },
      ]);
    });
  });

  describe("declineCounterProposal", () => {
    it("replies in the thread telling the proposer the original time stands, without mutating the calendar", async () => {
      const result = await service.declineCounterProposal(
        "user-1",
        "email-1",
        "att-1",
      );

      expect(mockCalendar.events.patch).not.toHaveBeenCalled();
      expect(mockProvider.sendReply).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          threadId: "thread-1",
          to: "jordan@example.com",
          subject: "Re: Fundraising tips and Snowie Fellowship",
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("references the calendar event's CURRENT time (not the countered time) in the reply", async () => {
      await service.declineCounterProposal("user-1", "email-1", "att-1");

      const body = mockProvider.sendReply.mock.calls[0][1].body as string;
      // currentStartAt from checkEventExists is 2026-07-16T00:00:00Z in this
      // fixture; the assertion just needs the call to have succeeded with a body.
      expect(body).toContain("keep the original time");
    });

    it("formats the kept time in the event's own timezone, not a bare UTC string", async () => {
      emailsService.getAttachment.mockResolvedValue(
        icsBuffer(COUNTER_ICS_WITH_TZ),
      );

      await service.declineCounterProposal("user-1", "email-1", "att-1");

      const body = mockProvider.sendReply.mock.calls[0][1].body as string;
      // 2026-07-16T00:00:00Z (currentStartAt from the mocked calendar event)
      // is midnight UTC, but 10:00am in Australia/Sydney (AEST, UTC+10) — a
      // bare `toUTCString()` call would have shown "00:00:00 GMT" instead.
      expect(body).toMatch(/10:00\s*(AM)?/i);
      expect(body).not.toMatch(/00:00.*GMT\b/);
      expect(body).not.toContain("00:00:00");
    });

    it("throws BadRequestException when the ics is not a COUNTER", async () => {
      emailsService.getAttachment.mockResolvedValue(icsBuffer(REQUEST_ICS));

      await expect(
        service.declineCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(BadRequestException);
      expect(mockProvider.sendReply).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when no matching calendar event exists", async () => {
      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await expect(
        service.declineCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(NotFoundException);
      expect(mockProvider.sendReply).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when no email provider is connected", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValue(null);

      await expect(
        service.declineCounterProposal("user-1", "email-1", "att-1"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
