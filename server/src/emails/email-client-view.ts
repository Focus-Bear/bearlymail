import { Logger } from "@nestjs/common";

import { sanitizeLogInput } from "../utils/sanitize-log";
import { unsubscribeMethodFromStored } from "./unsubscribe/list-unsubscribe.parser";

const logger = new Logger("EmailClientView");

interface ClientBoundEmail {
  id: string;
  unsubscribeOptions?: unknown;
  attachments?: unknown;
}

/**
 * Prepares a stored email, in place, for any endpoint that returns it to the
 * client. The unsubscribe URLs (with their per-recipient tokens) stay on the
 * server, which performs the action; the client only gets the method. A
 * non-array attachments value from bad stored data is normalised to null so
 * clients never hit `?.some is not a function` (#1589).
 */
export function prepareEmailForClient<T extends ClientBoundEmail>(email: T): T {
  const unsubscribeMethod = unsubscribeMethodFromStored(
    email.unsubscribeOptions,
  );
  Object.assign(email, { unsubscribeOptions: null, unsubscribeMethod });
  if (
    email.attachments !== null &&
    email.attachments !== undefined &&
    !Array.isArray(email.attachments)
  ) {
    logger.warn(
      `Email ${sanitizeLogInput(email.id)} has non-array attachments (type=${typeof email.attachments}). Normalising to null.`,
    );
    Object.assign(email, { attachments: null });
  }
  return email;
}
