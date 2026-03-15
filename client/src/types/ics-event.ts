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

/** Response from GET /calendar/ics-info/:emailId/:attachmentId */
export interface IcsInfoResponse {
  event: IcsEventData;
  alreadyInCalendar: boolean;
  calendarEventId?: string;
}
