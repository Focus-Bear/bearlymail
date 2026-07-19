import { UnauthorizedException } from "@nestjs/common";

import { DeletionReason } from "../../database/entities/deleted-account.entity";

/**
 * Thrown when a user whose account was deleted (either manually or due to
 * inactivity) attempts to log in with their correct credentials.
 *
 * Returns a structured 401 with error code ACCOUNT_DELETED so the frontend
 * can render a clear "your data was deleted per our privacy policy — please
 * sign up again" message instead of the generic "Invalid email or password".
 */
export class DeletedAccountException extends UnauthorizedException {
  constructor(reason: DeletionReason) {
    super({
      statusCode: 401,
      error: "ACCOUNT_DELETED",
      deletionReason: reason,
      message:
        reason === DeletionReason.INACTIVITY
          ? "Your account and data were automatically deleted after 30 days of inactivity, as described in our privacy policy. Please sign up again to create a new account."
          : "Your account and all associated data have been deleted as requested. Please sign up again to create a new account.",
    });
  }
}
