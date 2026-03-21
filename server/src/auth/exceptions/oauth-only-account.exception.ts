import { UnauthorizedException } from "@nestjs/common";

/**
 * Thrown when a user who signed up via OAuth (Google/Microsoft/Zoho) attempts
 * to log in using email + password but has no password hash set.
 *
 * Returns a structured 401 with error code OAUTH_ONLY_ACCOUNT so the frontend
 * can render a specific, actionable message instead of the generic "Invalid email
 * or password" error.
 */
export class OAuthOnlyAccountException extends UnauthorizedException {
  constructor(_email: string) {
    super({
      statusCode: 401,
      error: "OAUTH_ONLY_ACCOUNT",
      message:
        'This account was created via social login. Please use "Continue with Google/Microsoft/Zoho" or set a password via "Forgot Password".',
    });
  }
}
