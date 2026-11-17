/** Shared Gmail query for fetching inbox threads (excludes snoozed + VA-to-action labels). */
export const GMAIL_INBOX_QUERY =
  "in:inbox -label:SnoozedBearlyMail -label:VA-to-action";
