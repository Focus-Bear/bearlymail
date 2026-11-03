import { ForbiddenException } from "@nestjs/common";

import {
  GmailWriteAction,
  GOOGLE_PERMISSION_GROUP,
  IncrementalGooglePermissionGroup,
} from "../../constants/google-oauth-scopes";

/** Machine-readable code the client uses to start incremental consent. */
export const GOOGLE_PERMISSION_REQUIRED_CODE = "GOOGLE_PERMISSION_REQUIRED";

const PERMISSION_REQUIRED_MESSAGES: Record<
  IncrementalGooglePermissionGroup,
  string
> = {
  [GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE]:
    "BearlyMail needs permission to manage your Gmail to do this.",
  [GOOGLE_PERMISSION_GROUP.GMAIL_SEND]:
    "BearlyMail needs permission to send email from your Gmail.",
  [GOOGLE_PERMISSION_GROUP.CALENDAR]:
    "BearlyMail needs permission to use your Google Calendar.",
  [GOOGLE_PERMISSION_GROUP.CONTACTS]:
    "BearlyMail needs permission to read your Google contacts.",
};

/**
 * A structured 403 for an action the user's Google grant doesn't cover yet.
 * The client answers it by explaining the permission, asking Google for just
 * that group, and retrying the action once it comes back granted.
 */
export class GooglePermissionRequiredException extends ForbiddenException {
  constructor(
    readonly permission: IncrementalGooglePermissionGroup,
    readonly action?: GmailWriteAction,
  ) {
    super({
      statusCode: 403,
      code: GOOGLE_PERMISSION_REQUIRED_CODE,
      permission,
      ...(action ? { action } : {}),
      message: PERMISSION_REQUIRED_MESSAGES[permission],
    });
  }
}
