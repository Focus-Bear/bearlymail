import { Test, TestingModule } from "@nestjs/testing";

import { EmailService } from "../email/email.service";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { BookingNotificationService } from "./booking-notification.service";

describe("BookingNotificationService", () => {
  let service: BookingNotificationService;
  let usersService: jest.Mocked<UsersService>;
  let schedulingPreferencesService: jest.Mocked<SchedulingPreferencesService>;
  let emailService: jest.Mocked<EmailService>;

  const mockHost = mockPartial({
    id: "user-1",
    email: "host@example.com",
    name: "Host Name",
    displayName: "Host Display",
  });

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
    summary: "Project kickoff",
    meetLink: "https://meet.google.com/abc-defg-hij",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingNotificationService,
        {
          provide: UsersService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: SchedulingPreferencesService,
          useValue: {
            getPreferences: jest
              .fn()
              .mockResolvedValue({ timezone: "Australia/Melbourne" }),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendBookingConfirmationEmail: jest
              .fn()
              .mockResolvedValue(undefined),
            sendBookingOwnerNotificationEmail: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<BookingNotificationService>(
      BookingNotificationService,
    );
    usersService = module.get(UsersService);
    schedulingPreferencesService = module.get(SchedulingPreferencesService);
    emailService = module.get(EmailService);

    usersService.findOne.mockResolvedValue(mockHost);
  });

  it("sends a guest confirmation and an owner notification with the booking details", async () => {
    await service.sendBookingNotifications(bookOptions, bookedEvent);

    const expectedDetails = {
      hostName: "Host Display",
      hostEmail: "host@example.com",
      guestName: "Guest Name",
      guestEmail: "guest@example.com",
      title: "Project kickoff",
      whenFormatted: expect.stringContaining("(Australia/Melbourne)"),
      durationMinutes: 30,
      additionalGuests: ["extra@example.com"],
      meetLink: "https://meet.google.com/abc-defg-hij",
    };
    expect(emailService.sendBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining(expectedDetails),
    );
    expect(emailService.sendBookingOwnerNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining(expectedDetails),
    );
  });

  it("formats the slot start in the host timezone", async () => {
    await service.sendBookingNotifications(bookOptions, bookedEvent);

    const details = emailService.sendBookingConfirmationEmail.mock.calls[0][0];
    // 10:00 UTC on 15 Jan 2024 is 9:00 pm in Melbourne (AEDT, UTC+11)
    expect(details.whenFormatted).toContain("15 January 2024");
    expect(details.whenFormatted).toContain("9:00");
  });

  it("falls back to a default title when the event has no summary", async () => {
    await service.sendBookingNotifications(bookOptions, {
      id: "event-1",
      meetLink: null,
    });

    const details = emailService.sendBookingConfirmationEmail.mock.calls[0][0];
    expect(details.title).toBe("Meeting with Guest Name");
    expect(details.meetLink).toBeNull();
  });

  it("does not throw when the guest confirmation email fails", async () => {
    emailService.sendBookingConfirmationEmail.mockRejectedValue(
      new Error("SES error"),
    );

    await expect(
      service.sendBookingNotifications(bookOptions, bookedEvent),
    ).resolves.toBeUndefined();

    // The other email is still attempted
    expect(emailService.sendBookingOwnerNotificationEmail).toHaveBeenCalled();
  });

  it("does not throw when the owner notification email fails", async () => {
    emailService.sendBookingOwnerNotificationEmail.mockRejectedValue(
      new Error("SES error"),
    );

    await expect(
      service.sendBookingNotifications(bookOptions, bookedEvent),
    ).resolves.toBeUndefined();

    expect(emailService.sendBookingConfirmationEmail).toHaveBeenCalled();
  });

  it("does not throw when looking up the host fails", async () => {
    usersService.findOne.mockRejectedValue(new Error("DB down"));

    await expect(
      service.sendBookingNotifications(bookOptions, bookedEvent),
    ).resolves.toBeUndefined();

    expect(emailService.sendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(
      emailService.sendBookingOwnerNotificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("skips sending when the host has no email", async () => {
    usersService.findOne.mockResolvedValue(
      mockPartial({ id: "user-1", email: null }),
    );

    await service.sendBookingNotifications(bookOptions, bookedEvent);

    expect(emailService.sendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(
      emailService.sendBookingOwnerNotificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("falls back to UTC formatting when the host timezone is invalid and still sends both emails", async () => {
    schedulingPreferencesService.getPreferences.mockResolvedValue(
      mockPartial({ timezone: "Not/AZone" }),
    );

    await service.sendBookingNotifications(bookOptions, bookedEvent);

    const details = emailService.sendBookingConfirmationEmail.mock.calls[0][0];
    expect(details.whenFormatted).toContain("15 January 2024");
    expect(details.whenFormatted).toContain("(UTC)");
    expect(emailService.sendBookingOwnerNotificationEmail).toHaveBeenCalled();
  });

  it("falls back to the raw start time when the date is invalid and still sends both emails", async () => {
    await service.sendBookingNotifications(
      { ...bookOptions, startTime: "not-a-date" },
      bookedEvent,
    );

    const details = emailService.sendBookingConfirmationEmail.mock.calls[0][0];
    expect(details.whenFormatted).toBe("not-a-date (UTC)");
    expect(emailService.sendBookingOwnerNotificationEmail).toHaveBeenCalled();
  });

  it("falls back to UTC when scheduling preferences cannot be loaded", async () => {
    schedulingPreferencesService.getPreferences.mockRejectedValue(
      new Error("prefs error"),
    );

    await service.sendBookingNotifications(bookOptions, bookedEvent);

    const details = emailService.sendBookingConfirmationEmail.mock.calls[0][0];
    expect(details.whenFormatted).toContain("(UTC)");
  });
});
