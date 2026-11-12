/**
 * Turns a detected meeting proposal into a concrete decision for the scheduling card: fills in a
 * bare proposed time the LLM detector skipped, and finds free alternatives near the proposed slot
 * so "Suggest another time" can draft a reply with real options.
 */

import { calendar_v3, google } from "googleapis";
import { DateTime } from "luxon";

import {
  PROPOSAL_DETECTION_SOURCES,
  type ProposalDetectionSource,
} from "../constants/domain-types";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import type { DetectedMeetingProposal } from "../llm/llm-reply.service";
import type { SchedulingPreferenceData } from "../scheduling-preferences/scheduling-preferences.service";
import { logError } from "../utils/logger";
import type { CalendarService } from "./calendar.service";
import { BusyPeriod, calculateFreeSlots } from "./calendar-free-slots.helper";
import { extractProposedTimeFromThread } from "./proposed-time-pattern.extractor";

export type AttributedMeetingProposal = DetectedMeetingProposal & {
  /** Which detector produced the proposal; null when neither found one. */
  detectedBy: ProposalDetectionSource | null;
};

export interface PatternFallbackContext {
  latestBody: string;
  /** Raw bodies of earlier thread messages, oldest first. */
  priorBodies: string[];
  userTimezone: string;
  /** When the viewed email arrived, so "tomorrow" and the default day count from then. */
  receivedAt?: Date;
  now: Date;
}

/** The LLM resolved something the card can act on: a time/window, or a day to fill from availability. */
function isActionable(proposal: DetectedMeetingProposal): boolean {
  return (
    proposal.hasProposal &&
    Boolean(proposal.proposedTime || proposal.proposedDate)
  );
}

function cleanForExtraction(body: string): string {
  return cleanEmailContent(
    body,
    null,
    BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
  );
}

/**
 * Keeps the LLM's proposal when it found one. Otherwise falls back to the deterministic time
 * extractor, which accepts a bare time ("Would 11.30am (Fremantle time) suit?") that the LLM
 * prompt deliberately rejects because it names no day.
 */
export function applyTimePatternFallback(
  proposal: DetectedMeetingProposal,
  context: PatternFallbackContext,
): AttributedMeetingProposal {
  if (isActionable(proposal)) {
    return { ...proposal, detectedBy: PROPOSAL_DETECTION_SOURCES.LLM };
  }
  const extracted = extractProposedTimeFromThread({
    latestText: cleanForExtraction(context.latestBody),
    priorTexts: context.priorBodies.map(cleanForExtraction),
    userTimezone: context.userTimezone,
    receivedAt: context.receivedAt,
    now: context.now,
  });
  if (!extracted) {
    return { ...proposal, detectedBy: null };
  }
  return {
    ...proposal,
    hasProposal: true,
    bookingInvited: false,
    proposedTime: extracted.proposedTime,
    windowEnd: null,
    proposedDate: null,
    proposedTimezone: extracted.proposedTimezone,
    proposedTimeText: extracted.proposedTimeText,
    detectedBy: PROPOSAL_DETECTION_SOURCES.TIME_PATTERN,
  };
}

/** How many alternative slots "Suggest another time" offers. */
const ALTERNATIVE_SLOT_COUNT = 3;
/** Days (from the proposed day) searched for alternatives. */
const ALTERNATIVE_SEARCH_DAYS = 3;
/** Alternatives must also fall inside a normal working day for the sender. */
const SENDER_DAY_START_HOUR = 8;
const SENDER_DAY_END_HOUR = 18;
const DEFAULT_MEETING_MINUTES = 30;

export interface AlternativeSlotsRequest {
  proposedTime: string;
  durationMinutes: number | null;
  /** The sender's zone; alternatives outside their working day are dropped. */
  senderTimezone: string | null;
  prefs: SchedulingPreferenceData;
  now: Date;
}

function isWithinSenderDay(
  slotStart: string,
  senderTimezone: string | null,
): boolean {
  if (!senderTimezone) {
    return true;
  }
  const { hour } = DateTime.fromISO(slotStart).setZone(senderTimezone);
  return hour >= SENDER_DAY_START_HOUR && hour < SENDER_DAY_END_HOUR;
}

function toBusyPeriods(
  busy: calendar_v3.Schema$TimePeriod[] | undefined,
): BusyPeriod[] {
  return (busy ?? []).flatMap((period) =>
    period.start && period.end
      ? [{ start: period.start, end: period.end }]
      : [],
  );
}

/**
 * Up to {@link ALTERNATIVE_SLOT_COUNT} free starts closest to the proposed time, from the proposed
 * day onwards, inside the user's working hours and the sender's working day. Chronological order.
 * Returns [] when the calendar can't be read — the card then just omits the suggestions.
 */
export async function findAlternativeSlots(
  service: CalendarService,
  user: Parameters<CalendarService["createOAuth2Client"]>[0],
  request: AlternativeSlotsRequest,
): Promise<string[]> {
  const proposedMs = new Date(request.proposedTime).getTime();
  const proposedDay = DateTime.fromMillis(proposedMs)
    .setZone(request.prefs.timezone)
    .startOf("day");
  const searchStart = new Date(
    Math.max(request.now.getTime(), proposedDay.toMillis()),
  );
  const searchEnd = proposedDay
    .plus({ days: ALTERNATIVE_SEARCH_DAYS })
    .toJSDate();
  // A proposal days in the past leaves nothing to search, and free/busy rejects an empty range.
  if (searchEnd.getTime() <= searchStart.getTime()) {
    return [];
  }
  try {
    const calendar = google.calendar({
      version: "v3",
      auth: service.createOAuth2Client(user),
    });
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: searchStart.toISOString(),
        timeMax: searchEnd.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const slotPrefs = {
      ...request.prefs,
      slotDurationMinutes: request.durationMinutes ?? DEFAULT_MEETING_MINUTES,
    };
    return calculateFreeSlots(
      searchStart,
      searchEnd,
      toBusyPeriods(response.data.calendars?.primary?.busy),
      slotPrefs,
    )
      .map((slot) => slot.start)
      .filter(
        (start) =>
          new Date(start).getTime() !== proposedMs &&
          isWithinSenderDay(start, request.senderTimezone),
      )
      .sort(
        (first, second) =>
          Math.abs(new Date(first).getTime() - proposedMs) -
          Math.abs(new Date(second).getTime() - proposedMs),
      )
      .slice(0, ALTERNATIVE_SLOT_COUNT)
      .sort();
  } catch (error) {
    logError(
      "Failed to find alternative meeting slots",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}
