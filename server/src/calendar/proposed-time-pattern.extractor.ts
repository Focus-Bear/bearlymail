/**
 * Deterministic extraction of a proposed meeting time such as "Would 11.30am (Fremantle time)
 * suit?" — a clock time, optionally a place or zone, and often no day at all.
 *
 * The LLM detector only accepts proposals that name a specific day, so a bare time came back as
 * "no proposal" and the scheduling card fell back to generic "share your availability" actions.
 * This extractor is the fallback: it takes the day from the message itself, else from an earlier
 * message in the thread, else the next weekday occurrence of that time in the sender's zone.
 */

import * as chrono from "chrono-node";
import { DateTime } from "luxon";

import { MILLISECONDS } from "../constants/time-constants";
import {
  MONTH_FIRST_DATE_ZONE_PREFIX,
  TIMEZONE_ALIASES,
} from "../constants/timezone-aliases";

export interface PatternMeetingProposal {
  /** UTC ISO start of the proposed meeting. */
  proposedTime: string;
  /** Zone the sender meant (IANA name or fixed offset such as "UTC+10"). */
  proposedTimezone: string;
  /** The time as the sender wrote it, e.g. "11.30am (Fremantle time)". */
  proposedTimeText: string;
}

export interface ExtractProposedTimeInput {
  /** The message being viewed, already stripped of quoted replies and signatures. */
  latestText: string;
  /** Earlier messages in the thread, oldest first, already cleaned. */
  priorTexts: string[];
  /** The recipient's zone, used when the sender names none. */
  userTimezone: string;
  /**
   * When the message arrived. "Tomorrow" and the next-weekday default count from here, not from
   * when the user happens to open it. Defaults to `now`.
   */
  receivedAt?: Date;
  /** A slot that has already started by now is dropped: the meeting it proposed has passed. */
  now: Date;
}

interface ClockTime {
  hour: number;
  minute: number;
  /** Zone named right after the time, or null when the sender named none. */
  timezone: string | null;
  text: string;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

// "11.30am", "11:30 am", "2pm", "9 p.m." — a period or colon separator, am/pm required so plain
// numbers ("room 11", "3 people") never read as times.
const CLOCK_TIME_PATTERN =
  /\b(\d{1,2})(?:[.:]([0-5]\d))?\s*([ap])\.?m\.?(?![a-z])/gi;
const HOURS_ON_CLOCK_FACE = 12;
const PM_MARKER = "p";
// A time that ends ("1 to 3pm") or starts ("3pm-5pm") a range is a window, which the LLM detector
// handles; the fallback only resolves single times.
const RANGE_END_PATTERN = /\d\s*(?:[ap]\.?m\.?)?\s*(?:-|–|to|and)\s*$/i;
const RANGE_START_PATTERN = /^\s*(?:-|–|to|until)\s*\d/i;
// "from 2pm", "after 2pm", "by 2pm" bound a window or set a deadline rather than offer one slot.
const WINDOW_BOUNDARY_PATTERN =
  /\b(?:from|after|before|until|till|by|since)\s*$/i;
// A time the sender says they can't do is not a proposal.
const NEGATION_PATTERN =
  /\b(?:can['’]?t|cannot|can not|unable|unavailable|not available|won['’]?t|doesn['’]?t|isn['’]?t|busy)\b/i;
const SENTENCE_BOUNDARY_PATTERN = /[.!?\n](?=\s|$)/g;
// How far after the time to look for "(Fremantle time)" / "AEST" / "in Sydney".
const ZONE_LOOKAHEAD_CHARS = 40;
const ZONE_PREFIX_PATTERN = /^[\s(]*(?:in\s+)?/i;
const ZONE_SUFFIX_PATTERN = /^\s*(?:time)?\s*\)?/i;
const WORD_CHAR_PATTERN = /[a-z]/i;
// Never propose a time that starts within the hour — the sender can't mean "in five minutes".
const MIN_LEAD_MS = MILLISECONDS.HOUR;
// chrono rolls a year-less past date ("Monday 2 November") into next year; a meeting date that far
// out is almost certainly that, so mentions beyond this horizon are ignored.
const MAX_DAYS_AHEAD = 90;
const SATURDAY = 6;
const SUNDAY = 7;
const DAYS_PER_WEEK = 7;

const ZONE_ALIAS_KEYS_LONGEST_FIRST = Object.keys(TIMEZONE_ALIASES).sort(
  (first, second) => second.length - first.length,
);

function toTwentyFourHour(hour: number, meridiem: string): number {
  const hourOnClock = hour % HOURS_ON_CLOCK_FACE;
  return meridiem.toLowerCase() === PM_MARKER
    ? hourOnClock + HOURS_ON_CLOCK_FACE
    : hourOnClock;
}

function sentencePrefix(text: string, index: number): string {
  let start = 0;
  for (const boundary of text
    .slice(0, index)
    .matchAll(SENTENCE_BOUNDARY_PATTERN)) {
    start = (boundary.index ?? 0) + 1;
  }
  return text.slice(start, index);
}

/** Matches a known place/zone at the start of `tail`, returning the zone and the matched length. */
function matchZoneAlias(
  tail: string,
): { timezone: string; length: number } | null {
  const prefix = tail.match(ZONE_PREFIX_PATTERN)?.[0] ?? "";
  const rest = tail.slice(prefix.length).toLowerCase();
  const alias = ZONE_ALIAS_KEYS_LONGEST_FIRST.find(
    (key) =>
      rest.startsWith(key) && !WORD_CHAR_PATTERN.test(rest.charAt(key.length)),
  );
  if (!alias) {
    return null;
  }
  const afterAlias = tail.slice(prefix.length + alias.length);
  const suffix = afterAlias.match(ZONE_SUFFIX_PATTERN)?.[0] ?? "";
  return {
    timezone: TIMEZONE_ALIASES[alias],
    length: prefix.length + alias.length + suffix.trimEnd().length,
  };
}

/** The first single clock time in `text` that is offered (not declined, not part of a range). */
export function findProposedClockTime(text: string): ClockTime | null {
  for (const match of text.matchAll(CLOCK_TIME_PATTERN)) {
    const index = match.index ?? 0;
    const hour = Number(match[1]);
    const after = text.slice(index + match[0].length);
    const isOutOfRange = hour < 1 || hour > HOURS_ON_CLOCK_FACE;
    const before = text.slice(0, index);
    const isRange =
      RANGE_END_PATTERN.test(before) ||
      RANGE_START_PATTERN.test(after) ||
      WINDOW_BOUNDARY_PATTERN.test(before);
    if (
      isOutOfRange ||
      isRange ||
      NEGATION_PATTERN.test(sentencePrefix(text, index))
    ) {
      continue;
    }
    const zone = matchZoneAlias(after.slice(0, ZONE_LOOKAHEAD_CHARS));
    const textEnd = index + match[0].length + (zone?.length ?? 0);
    return {
      hour: toTwentyFourHour(hour, match[3]),
      minute: Number(match[2] ?? 0),
      timezone: zone?.timezone ?? null,
      text: text.slice(index, textEnd).trim(),
    };
  }
  return null;
}

function dateParserForZone(timezone: string): chrono.Chrono {
  return timezone.startsWith(MONTH_FIRST_DATE_ZONE_PREFIX)
    ? chrono.en.casual
    : chrono.en.GB;
}

/** The first specific day mentioned in `text` within the next {@link MAX_DAYS_AHEAD} days (in `timezone`). */
export function findMentionedDate(
  text: string,
  timezone: string,
  now: Date,
): CalendarDate | null {
  const nowInZone = DateTime.fromJSDate(now).setZone(timezone);
  const today = nowInZone.startOf("day");
  const horizon = today.plus({ days: MAX_DAYS_AHEAD });
  const results = dateParserForZone(timezone).parse(
    text,
    { instant: now, timezone: nowInZone.offset },
    { forwardDate: true },
  );
  for (const result of results) {
    const component = result.start;
    if (!component.isCertain("day") && !component.isCertain("weekday")) {
      continue;
    }
    const date = {
      year: component.get("year") ?? nowInZone.year,
      month: component.get("month") ?? nowInZone.month,
      day: component.get("day") ?? nowInZone.day,
    };
    const resolved = DateTime.fromObject(date, { zone: timezone });
    if (resolved.isValid && resolved >= today && resolved <= horizon) {
      return date;
    }
  }
  return null;
}

function isWeekend(date: DateTime): boolean {
  return date.weekday === SATURDAY || date.weekday === SUNDAY;
}

/** The next weekday at hour:minute in `timezone` that starts at least an hour from now. */
function nextOccurrence(
  clock: ClockTime,
  timezone: string,
  now: Date,
): DateTime {
  const earliest = now.getTime() + MIN_LEAD_MS;
  let candidate = DateTime.fromJSDate(now)
    .setZone(timezone)
    .set({ hour: clock.hour, minute: clock.minute, second: 0, millisecond: 0 });
  for (let day = 0; day <= DAYS_PER_WEEK; day++) {
    if (candidate.toMillis() >= earliest && !isWeekend(candidate)) {
      break;
    }
    candidate = candidate.plus({ days: 1 });
  }
  return candidate;
}

function findThreadDate(
  input: ExtractProposedTimeInput,
  timezone: string,
  referenceTime: Date,
): CalendarDate | null {
  const ownDate = findMentionedDate(input.latestText, timezone, referenceTime);
  if (ownDate) {
    return ownDate;
  }
  // Most recent earlier message first — the latest day discussed is the one being confirmed.
  for (const prior of [...input.priorTexts].reverse()) {
    const priorDate = findMentionedDate(prior, timezone, referenceTime);
    if (priorDate) {
      return priorDate;
    }
  }
  return null;
}

/**
 * Extracts a single proposed meeting time from the latest message, resolving its day from the
 * thread (or the next weekday occurrence) and its zone from the place named next to it.
 * Returns null when the message offers no single clock time, or when that time has already passed.
 */
export function extractProposedTimeFromThread(
  input: ExtractProposedTimeInput,
): PatternMeetingProposal | null {
  const clock = findProposedClockTime(input.latestText);
  if (!clock) {
    return null;
  }
  const timezone = clock.timezone ?? input.userTimezone;
  // A received time later than now (clock skew) or missing falls back to now.
  const referenceTime =
    input.receivedAt && input.receivedAt.getTime() <= input.now.getTime()
      ? input.receivedAt
      : input.now;
  const date = findThreadDate(input, timezone, referenceTime);
  const start = date
    ? DateTime.fromObject(
        { ...date, hour: clock.hour, minute: clock.minute },
        { zone: timezone },
      )
    : nextOccurrence(clock, timezone, referenceTime);
  const isStillAhead = start.isValid && start.toMillis() > input.now.getTime();
  const proposedTime = isStillAhead ? start.toUTC().toISO() : null;
  if (!proposedTime) {
    return null;
  }
  return {
    proposedTime,
    proposedTimezone: timezone,
    proposedTimeText: clock.text,
  };
}
