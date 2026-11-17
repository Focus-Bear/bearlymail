/** The scheduling card's view of a detected meeting proposal, as returned by check-proposed-time. */
import { ConflictingEvent } from './ConflictingEventsList';

export interface MeetingProposal {
  hasProposal: boolean;
  /**
   * True when the latest reply green-lit sending a calendar invite (e.g. "feel free to send an
   * invite") without accepting a specific time. proposedTime is then an editable default taken
   * from an earlier proposal in the thread (possibly one the sender just declined), so the card
   * asks the user to confirm/pick a time rather than implying the slot was accepted.
   */
  bookingInvited?: boolean;
  proposedTime: string | null;
  /** End of the proposed window when the sender gave a range; null for a fixed time. */
  windowEnd: string | null;
  /** Date the sender named without a time ("the 9th of July"); the backend fills the time from your availability. */
  proposedDate: string | null;
  /** Zone the sender meant (IANA name or "UTC+10"); drives "11:30 AM Perth = 2:30 PM your time". */
  proposedTimezone?: string | null;
  proposedTimeText: string | null;
  /** Which detector found the proposal ("llm" or "time_pattern"); shown in the admin debug panel. */
  detectedBy?: string | null;
  /** The user's scheduling timezone — "your time" is shown in it. */
  userTimezone?: string;
  /** Free starts (UTC ISO) near a single proposed time, offered by "Suggest another time". */
  alternativeSlots?: string[];
  topic: string | null;
  durationMinutes: number | null;
  isAvailable: boolean | null;
  /** Start of the free slot to suggest/pre-fill (UTC ISO); null on conflict or check failure. */
  suggestedTime: string | null;
  calendarConnected: boolean;
  /** True when the user already created an event for this proposal — show it as scheduled, not a conflict. */
  alreadyScheduled?: boolean;
  /** Google Calendar event URL for the already-created event ("View in Google Calendar"). */
  eventLink?: string | null;
  /** Google Meet link for the already-created event, if any. */
  meetLink?: string | null;
  /** The calendar events behind an isAvailable: false verdict, so the UI can name the conflict. */
  conflictingEvents?: ConflictingEvent[];
}

/**
 * A single proposed time with a free/busy verdict and nearby alternatives gets the one-glance
 * decision view (Accept / Suggest another time). Windows, date-only proposals and booking
 * green-lights keep the review form, since the user still has to pick the exact time.
 */
export function hasProposedTimeDecision(
  proposal: MeetingProposal | null,
): proposal is MeetingProposal & { proposedTime: string } {
  return (
    proposal !== null &&
    proposal.hasProposal &&
    Boolean(proposal.proposedTime) &&
    !proposal.windowEnd &&
    !proposal.proposedDate &&
    !proposal.bookingInvited &&
    !proposal.alreadyScheduled &&
    proposal.isAvailable !== null &&
    Array.isArray(proposal.alternativeSlots)
  );
}
