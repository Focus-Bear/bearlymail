/**
 * Formatting for a proposed meeting time shown in two zones — the sender's ("11:30 AM Perth") and
 * the user's ("2:30 PM your time, Tue 10 Nov") — plus the reply drafts built from it.
 */
import type { TFunction } from 'i18next';

import { MINUTES_PER_HOUR,MS_PER_MINUTE } from 'constants/numbers';

// Fixed offsets come from abbreviations ("AEST" → "UTC+10"); Intl only accepts IANA names, so these
// are applied by shifting the instant and formatting in UTC.
const FIXED_OFFSET_ZONE_PATTERN = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/i;
const NEGATIVE_SIGN = '-';
const UTC_ZONE = 'UTC';
const IANA_SEGMENT_SEPARATOR = '/';
const IANA_WORD_SEPARATOR = /_/g;

const CLOCK_TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

const DECISION_KEY_PREFIX = 'emailDetail.schedulingRequest.decision';
const DRAFT_LIST_BULLET = '- ';
const DRAFT_PARAGRAPH_BREAK = '\n\n';
const DRAFT_LINE_BREAK = '\n';
// The draft becomes HTML in the composer, so markup characters in a display name are dropped.
const MARKUP_CHARACTERS = /[<>&"]/g;

function fixedOffsetMinutes(zone: string): number | null {
  const match = FIXED_OFFSET_ZONE_PATTERN.exec(zone);
  if (!match) {
    return null;
  }
  const magnitude = Number(match[2]) * MINUTES_PER_HOUR + Number(match[3] ?? 0);
  return match[1] === NEGATIVE_SIGN ? -magnitude : magnitude;
}

/** Formats an instant as wall-clock text in `zone` (IANA name or "UTC±H[:MM]"). */
export function formatInZone(
  iso: string,
  zone: string | null | undefined,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(iso);
  if (!zone) {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
  const offset = fixedOffsetMinutes(zone);
  if (offset !== null) {
    const shifted = new Date(date.getTime() + offset * MS_PER_MINUTE);
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: UTC_ZONE }).format(shifted);
  }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

/** Short human label for a zone: "Australia/Perth" → "Perth", "UTC+10" stays "UTC+10". */
export function zoneLabel(zone: string): string {
  if (fixedOffsetMinutes(zone) !== null || !zone.includes(IANA_SEGMENT_SEPARATOR)) {
    return zone;
  }
  const city = zone.split(IANA_SEGMENT_SEPARATOR).pop() ?? zone;
  return city.replace(IANA_WORD_SEPARATOR, ' ');
}

export interface ProposedSlotDescription {
  senderTime: string;
  senderZone: string | null;
  localTime: string;
  localDate: string;
  /** True when the sender's wall clock equals the user's, so one time is enough. */
  isSameWallClock: boolean;
}

export function describeProposedSlot(
  proposedTime: string,
  senderTimezone: string | null | undefined,
  userTimezone: string | null | undefined,
  locale: string | undefined,
): ProposedSlotDescription {
  const localTime = formatInZone(proposedTime, userTimezone, locale, CLOCK_TIME_FORMAT);
  const localDate = formatInZone(proposedTime, userTimezone, locale, SHORT_DATE_FORMAT);
  if (!senderTimezone) {
    return { senderTime: localTime, senderZone: null, localTime, localDate, isSameWallClock: true };
  }
  const senderTime = formatInZone(proposedTime, senderTimezone, locale, CLOCK_TIME_FORMAT);
  const senderDate = formatInZone(proposedTime, senderTimezone, locale, SHORT_DATE_FORMAT);
  return {
    senderTime,
    senderZone: zoneLabel(senderTimezone),
    localTime,
    localDate,
    isSameWallClock: senderTime === localTime && senderDate === localDate,
  };
}

/**
 * A slot as the sender will read it in the reply: in their zone when known ("Wed 11 Nov, 11:30 AM
 * Perth time"), otherwise in the user's.
 */
export function formatSlotForReply(
  translate: TFunction,
  slotIso: string,
  senderTimezone: string | null | undefined,
  userTimezone: string | null | undefined,
  locale: string | undefined,
): string {
  const zone = senderTimezone ?? userTimezone;
  const date = formatInZone(slotIso, zone, locale, SHORT_DATE_FORMAT);
  const time = formatInZone(slotIso, zone, locale, CLOCK_TIME_FORMAT);
  if (!senderTimezone) {
    return translate(`${DECISION_KEY_PREFIX}.slotLocal`, { date, time });
  }
  return translate(`${DECISION_KEY_PREFIX}.slotInZone`, { date, time, zone: zoneLabel(senderTimezone) });
}

/** First name for a greeting ("Example Access Team" → "Example"); null when unknown. */
function greetingName(fromName: string | null | undefined): string | null {
  const first = fromName?.replace(MARKUP_CHARACTERS, '').trim().split(/\s+/)[0];
  return first ? first : null;
}

function greeting(translate: TFunction, fromName: string | null | undefined): string {
  const name = greetingName(fromName);
  return name
    ? translate(`${DECISION_KEY_PREFIX}.draftGreetingNamed`, { name })
    : translate(`${DECISION_KEY_PREFIX}.draftGreeting`);
}

/** Plain-text acceptance reply: confirms the slot the user just added to their calendar. */
export function buildAcceptanceDraft(
  translate: TFunction,
  fromName: string | null | undefined,
  slotText: string,
): string {
  return [
    greeting(translate, fromName),
    translate(`${DECISION_KEY_PREFIX}.draftAcceptBody`, { slot: slotText }),
    translate(`${DECISION_KEY_PREFIX}.draftSignOff`),
  ].join(DRAFT_PARAGRAPH_BREAK);
}

/** Plain-text reply that declines the proposed slot and offers the free alternatives as a list. */
export function buildAlternativesDraft(
  translate: TFunction,
  fromName: string | null | undefined,
  proposedText: string,
  alternativeTexts: string[],
): string {
  const options = alternativeTexts.map((text) => `${DRAFT_LIST_BULLET}${text}`).join(DRAFT_LINE_BREAK);
  return [
    greeting(translate, fromName),
    translate(`${DECISION_KEY_PREFIX}.draftAlternativesIntro`, { proposed: proposedText }),
    options,
    translate(`${DECISION_KEY_PREFIX}.draftSignOff`),
  ].join(DRAFT_PARAGRAPH_BREAK);
}
