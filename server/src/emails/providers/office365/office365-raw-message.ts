import { ERROR_MESSAGES } from "../../../constants/error-messages";
import type { Office365Provider } from "../office365.provider";
import { isAuthError } from "./office365-operations";

/** Graph segment that returns a message's MIME content instead of its JSON. */
const GRAPH_MIME_CONTENT_SEGMENT = "$value";

/**
 * Downloads a message's original MIME source (RFC 822) via Microsoft Graph's
 * `GET /me/messages/{id}/$value`. On an expired token it refreshes once and
 * retries; a second auth failure is rethrown so a revoked grant cannot loop.
 */
export async function getRawMessage(
  provider: Office365Provider,
  userId: string,
  messageId: string,
  hasRefreshedToken = false,
): Promise<Buffer> {
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) {
    throw new Error(ERROR_MESSAGES.OFFICE365_ACCOUNT_NOT_FOUND);
  }

  try {
    const graphClient = provider.client.createGraphClient(
      primaryAccount.accessToken,
    );
    const response = await graphClient.get<ArrayBuffer>(
      `/me/messages/${encodeURIComponent(messageId)}/${GRAPH_MIME_CONTENT_SEGMENT}`,
      { responseType: "arraybuffer" },
    );
    return Buffer.from(response.data);
  } catch (error: unknown) {
    if (!hasRefreshedToken && isAuthError(error)) {
      await provider.client.refreshTokenIfNeeded(userId, primaryAccount.id);
      return getRawMessage(provider, userId, messageId, true);
    }
    throw error;
  }
}
