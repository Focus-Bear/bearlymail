import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import { UsersService } from "../../../users/users.service";
import { sanitizeAxiosError } from "../../../utils/axios-error.utils";
import { shouldFlagSyncWindowLimited } from "../../sync-window-policy";

/**
 * Initial-sync overflow check for Office 365: flags `User.syncWindowLimited`
 * when the mailbox holds more mail than the sync-window policy imported —
 * either the windowed listing hit the fetch cap, or a cheap one-message probe
 * finds inbox mail older than the window. Probe failures are swallowed so the
 * sync itself never breaks.
 */
export async function flagSyncWindowLimitedIfNeeded(
  deps: { usersService: UsersService; logger: Logger },
  params: {
    userId: string;
    graphClient: AxiosInstance;
    since: string;
    hitFetchCap: boolean;
  },
): Promise<void> {
  const { usersService, logger } = deps;
  const { userId, graphClient, since, hitFetchCap } = params;
  try {
    let olderMailExists = false;
    if (!hitFetchCap) {
      const olderResponse = await graphClient.get(
        "/me/mailFolders/inbox/messages",
        {
          params: {
            $filter: `receivedDateTime lt ${since}`,
            $top: 1,
            $select: "id",
          },
        },
      );
      olderMailExists = (olderResponse.data.value || []).length > 0;
    }
    if (
      shouldFlagSyncWindowLimited({
        isInitialSync: true,
        hitFetchCap,
        olderMailExists,
      })
    ) {
      await usersService.markSyncWindowLimited(userId);
    }
  } catch (error) {
    logger.warn(
      `older-mail probe failed for user ${userId} — skipping syncWindowLimited check: ${sanitizeAxiosError(error)}`,
    );
  }
}
