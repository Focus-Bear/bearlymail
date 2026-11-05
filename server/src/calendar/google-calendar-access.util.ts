import {
  GOOGLE_PERMISSION_GROUP,
  hasGooglePermission,
} from "../constants/google-oauth-scopes";
import { User } from "../database/entities/user.entity";

type CalendarAccessFields = Pick<
  User,
  "googleCalendarAccessToken" | "googleGrantedScopes"
>;

/**
 * Whether BearlyMail may call Google Calendar for this user. The Google token
 * alone isn't enough: sign-in only asks for Gmail, and calendar is granted
 * later, so a token without the calendar scopes would just 403. Callers treat
 * false exactly like "calendar not connected".
 */
export function hasGoogleCalendarAccess<T extends CalendarAccessFields>(
  user: T | null | undefined,
): user is T & { googleCalendarAccessToken: string } {
  return (
    !!user?.googleCalendarAccessToken &&
    hasGooglePermission(
      user.googleGrantedScopes,
      GOOGLE_PERMISSION_GROUP.CALENDAR,
    )
  );
}
