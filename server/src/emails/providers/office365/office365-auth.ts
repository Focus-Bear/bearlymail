import { Logger } from "@nestjs/common";

import { ERROR_MESSAGES } from "../../../constants/error-messages";
import { MILLISECONDS, MINUTES } from "../../../constants/time-constants";
import { Office365Account } from "../../../database/entities/office365-account.entity";
import { User } from "../../../database/entities/user.entity";
import { Office365AccountsService } from "../../../office365-accounts/office365-accounts.service";

/**
 * Check if user is within grace period (5 minutes after login)
 */
export function isWithinGracePeriod(user: {
  updatedAt?: Date | string | null;
}): boolean {
  if (!user.updatedAt) {
    return false;
  }

  const fiveMinutesAgo = new Date(
    Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
  );
  const userUpdatedAt = new Date(user.updatedAt);
  return userUpdatedAt.getTime() > fiveMinutesAgo.getTime();
}

/**
 * Log auth failure with comprehensive details
 */
export async function logOffice365AuthFailure(
  userId: string,
  userEmail: string | null,
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { authLogger } = await import("../../../auth/auth-logger");
  authLogger.logAuthFailure(userId, userEmail, context, error, metadata);
}

/**
 * Handles a missing Office 365 refresh token during sync: logs the auth
 * failure, clears the stored refresh token outside the login grace period so
 * the account is flagged for re-login, and always throws. Extracted from
 * Office365Provider to keep that class under the max-lines limit.
 */
export async function handleMissingOffice365RefreshToken(
  deps: {
    office365AccountsService: Office365AccountsService;
    logger: Logger;
  },
  params: {
    userId: string;
    user: User;
    primaryAccount: Office365Account;
    isRecentLogin: boolean;
  },
): Promise<never> {
  const { office365AccountsService, logger } = deps;
  const { userId, user, primaryAccount, isRecentLogin } = params;
  await logOffice365AuthFailure(
    userId,
    user.email || null,
    "syncEmails-missingRefreshToken",
    new Error("Refresh token missing"),
    {
      hasAccessToken: !!primaryAccount.accessToken,
      isRecentLogin,
      userUpdatedAt: user?.updatedAt?.toISOString() || null,
    },
  );

  if (!isRecentLogin && !primaryAccount.needsRelogin) {
    await office365AccountsService.updateTokens(
      primaryAccount.id,
      userId,
      primaryAccount.accessToken,
      undefined,
    );
    throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_MISSING);
  } else if (isRecentLogin) {
    logger.warn(
      `⚠️ Refresh token missing for recently logged-in user ${userId}, but within grace period.`,
    );
    throw new Error("Refresh token missing (within grace period - will retry)");
  }
  throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_MISSING);
}
