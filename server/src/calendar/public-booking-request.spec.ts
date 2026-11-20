import { BadRequestException } from "@nestjs/common";

import { parsePublicBookingRequest } from "./public-booking-request";

const valid = {
  startTime: "2026-12-01T10:00:00Z",
  guestEmail: "guest@example.com",
  guestName: "Guest",
};

describe("parsePublicBookingRequest", () => {
  it("accepts a minimal valid request", () => {
    expect(parsePublicBookingRequest(valid)).toEqual({
      ...valid,
      additionalGuests: [],
      agenda: undefined,
    });
  });

  it("ignores fields it does not know, such as a caller-chosen duration", () => {
    const parsed = parsePublicBookingRequest({ ...valid, duration: 100000 });

    expect(parsed).not.toHaveProperty("duration");
  });

  it.each([
    ["no body", undefined],
    ["a missing start time", { ...valid, startTime: undefined }],
    ["a non-text start time", { ...valid, startTime: 5 }],
    ["a missing guest email", { ...valid, guestEmail: "" }],
    ["a malformed guest email", { ...valid, guestEmail: "not-an-email" }],
    ["a non-text guest email", { ...valid, guestEmail: { a: 1 } }],
    [
      "an over-long guest email",
      { ...valid, guestEmail: `${"a".repeat(260)}@x.io` },
    ],
    ["an over-long name", { ...valid, guestName: "n".repeat(201) }],
    ["a malformed additional guest", { ...valid, additionalGuests: ["nope"] }],
    ["a non-text additional guest", { ...valid, additionalGuests: [7] }],
    [
      "too many additional guests",
      {
        ...valid,
        additionalGuests: Array.from({ length: 11 }, (_, i) => `g${i}@x.io`),
      },
    ],
    ["an over-long agenda", { ...valid, agenda: "a".repeat(501) }],
    ["a non-text agenda", { ...valid, agenda: ["x"] }],
  ])("rejects %s", (_label, body) => {
    expect(() => parsePublicBookingRequest(body)).toThrow(BadRequestException);
  });

  it("flattens line breaks in the guest name", () => {
    const parsed = parsePublicBookingRequest({
      ...valid,
      guestName: "Guest\r\nBcc: other@example.com",
    });

    expect(parsed.guestName).toBe("Guest Bcc: other@example.com");
  });

  it("strips HTML tags from the agenda", () => {
    const parsed = parsePublicBookingRequest({
      ...valid,
      agenda: "<b>Quarterly</b> review",
    });

    expect(parsed.agenda).toBe("Quarterly review");
  });
});
