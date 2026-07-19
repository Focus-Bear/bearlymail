/** Attendee from a parsed ICS VEVENT */
export interface IcsAttendee {
  name?: string;
  email: string;
  /** ACCEPTED | DECLINED | TENTATIVE | NEEDS-ACTION */
  status?: string;
  /**
   * Free-text comment attached to the attendee's response (ICS
   * X-RESPONSE-COMMENT param), e.g. why they declined or are proposing a new
   * time. Only meaningful on a METHOD:COUNTER/REPLY ics.
   */
  comment?: string;
}

/** Structured data extracted from the first VEVENT in an ICS file */
export interface IcsEventData {
  uid: string;
  title: string;
  /** ISO 8601 UTC string */
  startAt: string;
  /** ISO 8601 UTC string (absent for zero-duration events) */
  endAt?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  organizer?: {
    name?: string;
    email: string;
  };
  attendees: IcsAttendee[];
  /** IANA timezone name */
  timezone?: string;
  /** True if the event has an RRULE (recurring) */
  isRecurring: boolean;
  /**
   * VCALENDAR/VEVENT METHOD (REQUEST, REPLY, CANCEL, COUNTER, ...).
   * Undefined for a METHOD-less ics (treat as a plain REQUEST).
   * COUNTER means an attendee declined and proposed the new time carried in
   * startAt/endAt above — see IcsInviteCard's reschedule-request branch.
   */
  method?: string;
}

/** User's RSVP status on a Google Calendar event */
export type GoogleResponseStatus = 'accepted' | 'declined' | 'tentative' | 'needsAction';

/** Response from GET /calendar/ics-info/:emailId/:attachmentId */
export interface IcsInfoResponse {
  event: IcsEventData;
  alreadyInCalendar: boolean;
  calendarEventId?: string;
  /** User's current RSVP status on the Google Calendar event */
  userResponseStatus?: GoogleResponseStatus;
  /** Direct link to the event in Google Calendar */
  htmlLink?: string;
  /**
   * The matched calendar event's CURRENT start/end (ISO 8601 UTC), populated
   * whenever alreadyInCalendar is true. For a METHOD:COUNTER ics, lets the
   * client show "current time" vs the counter-proposed "new time" (event.startAt/endAt).
   */
  currentStartAt?: string;
  currentEndAt?: string;
}
