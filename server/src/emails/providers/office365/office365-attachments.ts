import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import { isApiError } from "../../../types/common";
import type { Office365Provider } from "../office365.provider";
import { MicrosoftGraphAttachment } from "./office365-message-parser";
import { isAuthError } from "./office365-operations";

/**
 * Fetch attachment metadata (no contentBytes) for a message.
 * Used during sync to populate EmailAttachment[] without downloading file content.
 */
export async function fetchAttachmentMetadata(
  graphClient: AxiosInstance,
  messageId: string,
  logger: Logger,
): Promise<MicrosoftGraphAttachment[]> {
  try {
    const response = await graphClient.get(
      `/me/messages/${messageId}/attachments`,
    );
    return (response.data?.value as MicrosoftGraphAttachment[]) ?? [];
  } catch (err) {
    const body =
      isApiError(err) && err.response?.data
        ? JSON.stringify(err.response.data)
        : "";
    logger.warn(
      `[fetchAttachmentMetadata] failed for msgId=${messageId}: ${err instanceof Error ? err.message : String(err)} ${body}`.trim(),
    );
    return [];
  }
}

/**
 * Download a single attachment's bytes via Microsoft Graph and return a Buffer
 * along with filename, MIME type, and size. Falls back to stored metadata when
 * the Graph response is missing fields.
 */
export async function getAttachment(
  provider: Office365Provider,
  userId: string,
  messageId: string,
  attachmentId: string,
  attachmentMetadata?: { filename: string; mimeType: string; size: number },
): Promise<{
  attachmentBuffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) {
    throw new Error("No Office365 account found for user");
  }

  try {
    const graphClient = provider.client.createGraphClient(
      primaryAccount.accessToken,
    );

    const response = await graphClient.get(
      `/me/messages/${messageId}/attachments/${attachmentId}`,
    );

    const attachmentPayload = response.data as MicrosoftGraphAttachment;
    const attachmentBuffer = Buffer.from(
      attachmentPayload.contentBytes ?? "",
      "base64",
    );

    return {
      attachmentBuffer,
      filename:
        attachmentPayload.name || attachmentMetadata?.filename || "attachment",
      mimeType:
        attachmentPayload.contentType ||
        attachmentMetadata?.mimeType ||
        "application/octet-stream",
      size:
        attachmentPayload.size ||
        attachmentMetadata?.size ||
        attachmentBuffer.length,
    };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      await provider.client.refreshTokenIfNeeded(userId, primaryAccount.id);
      return getAttachment(
        provider,
        userId,
        messageId,
        attachmentId,
        attachmentMetadata,
      );
    }
    throw error;
  }
}
