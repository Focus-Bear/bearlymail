import { OAUTH_ERROR_TYPES } from "../constants/auth-constants";
import { MISSING_GMAIL_PERMISSION_MESSAGE } from "../constants/google-oauth-scopes";

type OAuthErrorType =
  (typeof OAUTH_ERROR_TYPES)[keyof typeof OAUTH_ERROR_TYPES];

/** Maps an OAuth failure message to the /auth-error page variant to show. */
export function determineOAuthErrorType(errorMessage: string): OAuthErrorType {
  if (errorMessage.includes("pending approval"))
    return OAUTH_ERROR_TYPES.PENDING_APPROVAL;
  if (
    errorMessage.includes("waitlist") ||
    errorMessage.includes("join the waitlist")
  ) {
    return OAUTH_ERROR_TYPES.NOT_ON_WAITLIST;
  }
  if (errorMessage === MISSING_GMAIL_PERMISSION_MESSAGE)
    return OAUTH_ERROR_TYPES.MISSING_GMAIL_PERMISSION;
  return OAUTH_ERROR_TYPES.AUTH_ERROR;
}
