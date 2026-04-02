import { Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { EmailsService } from "../emails.service";
import { verifyThreadStatusesInGmail } from "./gmail/gmail-sync";

/**
 * Compares non-archived DB threads against Gmail labels; updates star/archive
 * when Gmail disagrees. Extracted to keep GmailSyncService under max-lines.
 */
export async function verifyInboxStatusForUser(
  userId: string,
  gmail: gmail_v1.Gmail,
  emailsService: EmailsService,
  logger: Logger,
): Promise<void> {
  const allThreadIds = await emailsService.getAllNonArchivedThreadIds(userId);
  if (allThreadIds.length === 0) return;

  logger.log(
    `[VerifyInbox] Checking ${allThreadIds.length} non-archived threads for user ${userId}`,
  );

  const updates = await verifyThreadStatusesInGmail(
    userId,
    allThreadIds,
    gmail,
  );

  if (updates.length === 0) return;

  const starUpdates = updates.filter((upd) => upd.starCount !== undefined);
  const archiveUpdates = updates.filter((upd) => upd.isArchived !== undefined);

  if (starUpdates.length > 0) {
    await emailsService.batchUpdateThreadStarCount(
      userId,
      starUpdates.map((upd) => ({
        threadId: upd.threadId,
        starCount: upd.starCount,
      })),
    );
  }
  if (archiveUpdates.length > 0) {
    await emailsService.batchUpdateThreadArchivedStatuses(
      userId,
      archiveUpdates.map((upd) => ({
        threadId: upd.threadId,
        isArchived: upd.isArchived,
      })),
    );
  }

  const archivedCount = updates.filter((upd) => upd.isArchived).length;
  logger.log(
    `[VerifyInbox] Done for user ${userId}: ${updates.length} checked, ${archivedCount} newly archived`,
  );
}
