/** Attendee from a parsed ICS VEVENT */
export interface IcsAttendee {
  name?: string;
  email: string;
  /** ACCEPTED | DECLINED | TENTATIVE | NEEDS-ACTION */
  status?: string;
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
}

/** User's RSVP status on a Google Calendar event */
export type GoogleResponseStatus =
  | 'accepted'
  | 'declined'
  | 'tentative'
  | 'needsAction';

/** Response from GET /calendar/ics-info/:emailId/:attachmentId */
export interface IcsInfoResponse {
  event: IcsEventData;
  alreadyInCalendar: boolean;
  calendarEventId?: string;
  /** User's current RSVP status on the Google Calendar event */
  userResponseStatus?: GoogleResponseStatus;
  /** Direct link to the event in Google Calendar */
  htmlLink?: string;
}
