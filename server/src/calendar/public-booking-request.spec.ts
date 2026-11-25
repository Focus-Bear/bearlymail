import { BadRequestException } from "@nestjs/common";

import { MAX_BOOKING_HORIZON_DAYS } from "../constants/booking-constants";
import {
  parsePublicBookingRequest,
  parsePublicSlotsQuery,
} from "./public-booking-request";

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

  it("strips tags that only appear once another tag is removed", () => {
    const parsed = parsePublicBookingRequest({
      ...valid,
      agenda: "<scr<b>ipt>alert(1)</scr</b>ipt> review",
    });

    expect(parsed.agenda).toBe("alert(1) review");
  });

  it("strips HTML tags from the agenda", () => {
    const parsed = parsePublicBookingRequest({
      ...valid,
      agenda: "<b>Quarterly</b> review",
    });

    expect(parsed.agenda).toBe("Quarterly review");
  });
});

describe("parsePublicSlotsQuery", () => {
  const defaults = { daysAhead: 14, limit: 8, maxLimit: 50 };

  it("uses the defaults when nothing is given", () => {
    expect(parsePublicSlotsQuery({}, defaults)).toEqual({
      daysAhead: 14,
      offset: 0,
      limit: 8,
      afterDate: undefined,
    });
  });

  it("caps daysAhead at the booking horizon and limit at maxLimit", () => {
    const parsed = parsePublicSlotsQuery(
      { daysAhead: "99999", limit: "1000", offset: "16" },
      defaults,
    );

    expect(parsed.daysAhead).toBe(MAX_BOOKING_HORIZON_DAYS);
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(16);
  });

  it("parses a valid afterDate", () => {
    const parsed = parsePublicSlotsQuery(
      { afterDate: "2026-12-01T10:00:00Z" },
      defaults,
    );

    expect(parsed.afterDate?.toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });

  it.each([
    ["a non-numeric offset", { offset: "abc" }],
    ["a negative daysAhead", { daysAhead: "-5" }],
    ["a fractional limit", { limit: "2.5" }],
    ["an invalid afterDate", { afterDate: "not-a-date" }],
  ])("rejects %s", (_label, query) => {
    expect(() => parsePublicSlotsQuery(query, defaults)).toThrow(
      BadRequestException,
    );
  });
});
