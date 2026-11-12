import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

import { BookingEmailDetails, EmailService } from "./email.service";

// The jest mjml mock (src/__mocks__/mjml.ts) resolves to this, like mjml v5.
const RENDERED_HTML = "<html><body></body></html>";

const bookingDetails: BookingEmailDetails = {
  hostName: "Host",
  hostEmail: "host@example.com",
  guestName: "Guest",
  guestEmail: "guest@example.com",
  title: "Intro call",
  whenFormatted: "Mon 3 Nov, 10:00",
  durationMinutes: 30,
  additionalGuests: [],
  meetLink: null,
};

describe("EmailService", () => {
  let service: EmailService;
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest
      .spyOn(SESClient.prototype, "send")
      .mockResolvedValue({ MessageId: "msg-1" } as never);
    service = new EmailService({
      get: () => undefined,
    } as unknown as ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  /** The HTML body of the single SES email that was sent. */
  const sentHtml = (): unknown => {
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as SendEmailCommand;
    return command.input.Message?.Body?.Html?.Data;
  };

  // mjml v5 renders asynchronously; without `await` the HTML body was
  // undefined, so these emails reached SES with no HTML part.
  it("sends the rendered HTML for a password reset", async () => {
    await service.sendPasswordResetEmail("user@example.com", "Ana", "token-1");
    expect(sentHtml()).toBe(RENDERED_HTML);
  });

  it("sends the rendered HTML for a waitlist approval", async () => {
    await service.sendWaitlistApprovalEmail("user@example.com", "Ana", "tok");
    expect(sentHtml()).toBe(RENDERED_HTML);
  });

  it("sends the rendered HTML for a waitlist confirmation", async () => {
    await service.sendWaitlistConfirmationEmail("user@example.com", "Ana");
    expect(sentHtml()).toBe(RENDERED_HTML);
  });

  it("sends the rendered HTML for a booking confirmation", async () => {
    await service.sendBookingConfirmationEmail(bookingDetails);
    expect(sentHtml()).toBe(RENDERED_HTML);
  });
});
