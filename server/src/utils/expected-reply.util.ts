import { HOURS_PER_DAY } from "../constants/time-constants";
import { durationToHours } from "../snooze/parse-duration";

/** Minimum follow-up window, in days, for any non-zero expected reply time. */
const MIN_FOLLOW_UP_DAYS = 1;

/**
 * The follow-up fields a send endpoint accepts, in the shapes they arrive in.
 * Multipart/form-data stringifies numbers, so `expectedReplyHours` is widened.
 */
export interface ExpectedReplyInput {
  expectedReplyHours?: number | string;
  /**
   * Free-text follow-up window ("3d", "next Monday", "5pm"), parsed with the
   * same parser as snooze. Takes precedence over `expectedReplyHours`.
   */
  expectedReplyDuration?: string;
  /** UI language (e.g. "en", "es") used to parse `expectedReplyDuration`. */
  locale?: string;
}

/**
 * Resolves the follow-up window a send request asked for into whole hours.
 *
 * Shared by every send endpoint so a reply and a composed message interpret the
 * same request fields identically. Returns undefined when no usable window was
 * given; an explicit 0 still means "no follow-up" and is preserved.
 */
export function resolveExpectedReplyHours(
  input: ExpectedReplyInput,
  now: Date = new Date(),
): number | undefined {
  const customDuration = input.expectedReplyDuration?.trim();
  if (customDuration) {
    return durationToHours(customDuration, now, input.locale);
  }
  const hours =
    typeof input.expectedReplyHours === "string"
      ? parseInt(input.expectedReplyHours, 10)
      : input.expectedReplyHours;
  return hours === undefined || isNaN(hours) ? undefined : hours;
}

/**
 * Converts an expected reply window in hours to the whole-day granularity the
 * FollowUp record stores, rounding up so a sub-day window still gets a day.
 */
export function followUpDaysFromHours(expectedReplyHours: number): number {
  return Math.max(
    MIN_FOLLOW_UP_DAYS,
    Math.ceil(expectedReplyHours / HOURS_PER_DAY),
  );
}
