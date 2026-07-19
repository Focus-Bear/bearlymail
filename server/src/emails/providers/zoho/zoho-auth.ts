import { MILLISECONDS, MINUTES } from "../../../constants/time-constants";

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
export async function logZohoAuthFailure(
  userId: string,
  userEmail: string | null,
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { authLogger } = await import("../../../auth/auth-logger");
  authLogger.logAuthFailure(userId, userEmail, context, error, metadata);
}
