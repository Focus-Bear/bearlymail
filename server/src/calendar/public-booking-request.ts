import { BadRequestException } from "@nestjs/common";

import {
  MAX_ADDITIONAL_GUESTS,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_GUEST_EMAIL_LENGTH,
  MAX_GUEST_NAME_LENGTH,
} from "../constants/booking-constants";

const MAX_AGENDA_LENGTH = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PublicBookingRequest {
  startTime: string;
  guestEmail: string;
  guestName: string;
  additionalGuests: string[];
  agenda: string | undefined;
}

function isEmailAddress(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_GUEST_EMAIL_LENGTH &&
    EMAIL_PATTERN.test(value)
  );
}

function parseGuestName(value: unknown): string {
  const name =
    typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() : "";
  if (name.length > MAX_GUEST_NAME_LENGTH) {
    throw new BadRequestException(
      `Name must be ${MAX_GUEST_NAME_LENGTH} characters or fewer.`,
    );
  }
  return name;
}

function parseAdditionalGuests(value: unknown): string[] {
  const guests = Array.isArray(value) ? value : [];
  if (guests.length > MAX_ADDITIONAL_GUESTS) {
    throw new BadRequestException(
      `Too many additional guests. Maximum is ${MAX_ADDITIONAL_GUESTS}.`,
    );
  }
  for (const email of guests) {
    if (!isEmailAddress(email)) {
      throw new BadRequestException("Invalid additional guest email address");
    }
  }
  return guests as string[];
}

function parseAgenda(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BadRequestException("Agenda must be text.");
  }
  if (value.length > MAX_AGENDA_LENGTH) {
    throw new BadRequestException(
      `Agenda must be ${MAX_AGENDA_LENGTH} characters or fewer.`,
    );
  }
  // Strip HTML tags, repeating until none are left so that removing one tag
  // cannot join the pieces of another (CWE-116). [^<>] keeps each pass linear
  // (CWE-1333). The agenda is used as plain text, never rendered as HTML.
  let text = value;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "");
  } while (text !== previous);
  return text.trim() || undefined;
}

/**
 * Validates the body of an unauthenticated booking request. The endpoint is
 * public, so every field is checked here rather than trusted: types, lengths
 * and address formats. Whether the time is actually free is checked separately
 * against the host's calendar.
 */
export function parsePublicBookingRequest(body: unknown): PublicBookingRequest {
  const input = (body ?? {}) as Record<string, unknown>;
  if (typeof input.startTime !== "string" || !input.startTime) {
    throw new BadRequestException("Start time and guest email are required");
  }
  if (!input.guestEmail) {
    throw new BadRequestException("Start time and guest email are required");
  }
  if (!isEmailAddress(input.guestEmail)) {
    throw new BadRequestException("Invalid guest email address");
  }
  return {
    startTime: input.startTime,
    guestEmail: input.guestEmail,
    guestName: parseGuestName(input.guestName),
    additionalGuests: parseAdditionalGuests(input.additionalGuests),
    agenda: parseAgenda(input.agenda),
  };
}

export interface PublicSlotsQuery {
  daysAhead: number;
  offset: number;
  limit: number;
  afterDate: Date | undefined;
}

function parseNonNegativeInt(
  name: string,
  raw: unknown,
  fallback: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const text = String(raw);
  if (!/^\d+$/.test(text)) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }
  return Math.min(Number(text), max);
}

/**
 * Validates the query of the unauthenticated slots endpoint. Each request reads
 * the host's calendar, so the search window is capped at the booking horizon
 * and malformed numbers or dates are rejected instead of reaching the service.
 */
export function parsePublicSlotsQuery(
  query: Record<string, unknown>,
  defaults: { daysAhead: number; limit: number; maxLimit: number },
): PublicSlotsQuery {
  const daysAhead = parseNonNegativeInt(
    "daysAhead",
    query.daysAhead,
    defaults.daysAhead,
    MAX_BOOKING_HORIZON_DAYS,
  );
  const offset = parseNonNegativeInt(
    "offset",
    query.offset,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const limit = parseNonNegativeInt(
    "limit",
    query.limit,
    defaults.limit,
    defaults.maxLimit,
  );
  let afterDate: Date | undefined;
  if (query.afterDate !== undefined && query.afterDate !== "") {
    afterDate = new Date(String(query.afterDate));
    if (Number.isNaN(afterDate.getTime())) {
      throw new BadRequestException("afterDate must be a valid date");
    }
  }
  return { daysAhead, offset, limit, afterDate };
}
