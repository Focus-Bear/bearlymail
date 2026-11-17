import { ForbiddenException } from "@nestjs/common";

/** Error code the client checks to show "connect an email account" instead of a broken inbox. */
export const EMAIL_PROVIDER_REQUIRED_ERROR = "EMAIL_PROVIDER_REQUIRED";

/**
 * Thrown by EmailProviderRequiredGuard when the user has no mailbox connected.
 * Returns a structured 403 with error code EMAIL_PROVIDER_REQUIRED so the
 * frontend can offer to connect one, rather than spinning or showing a
 * generic failure.
 */
export class EmailProviderRequiredException extends ForbiddenException {
  constructor() {
    super({
      error: EMAIL_PROVIDER_REQUIRED_ERROR,
      message:
        "Email provider connection required. Please connect an email account to continue.",
    });
  }
}
