import { Logger } from "@nestjs/common";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import { UsersService } from "../users/users.service";

const logger = new Logger("GoogleOAuthClient");

/**
 * Builds a per-user `OAuth2Client` and wires up the `tokens` event so that
 * **every** rotation Google performs (new access_token, and crucially the
 * occasional new refresh_token) is persisted back to `users` immediately.
 *
 * We previously had ~8 places constructing OAuth2Client by hand, and most of
 * them never registered the listener. When Google rotated the refresh_token
 * the new value was emitted on the client and then thrown away, leaving the
 * DB with a refresh_token Google has already invalidated. The next call hit
 * `invalid_grant` and the user was bumped to re-login. That's the relogin
 * loop the team chased for weeks.
 *
 * Always create the client through this helper. The redirectUri argument
 * exists so the calendar booking path can pass its specialised callback URL.
 */
export function createUserGoogleOAuthClient(
  usersService: UsersService,
  userId: string,
  accessToken: string | null | undefined,
  refreshToken: string | null | undefined,
  options?: { redirectUri?: string },
): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = options?.redirectUri ?? process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    logger.warn(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI is missing — OAuth calls will fail",
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  client.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  });

  client.on("tokens", (tokens) => {
    if (!tokens.access_token && !tokens.refresh_token) return;
    const updates: {
      googleCalendarAccessToken?: string;
      googleCalendarRefreshToken?: string;
    } = {};
    if (tokens.access_token) {
      updates.googleCalendarAccessToken = tokens.access_token;
    }
    if (tokens.refresh_token) {
      updates.googleCalendarRefreshToken = tokens.refresh_token;
      logger.log(
        `[GoogleOAuthClient] Persisting rotated refresh_token for user ${userId}`,
      );
    } else if (tokens.access_token) {
      // Access-token-only rotation proves the stored refresh_token is STILL
      // valid. Logged so that, when a user reports being logged out, we can see
      // exactly when refreshes stopped succeeding (i.e. the refresh_token went
      // invalid_grant) vs. the failure being elsewhere.
      logger.log(
        `[GoogleOAuthClient] Refreshed access_token for user ${userId} (refresh_token still valid)`,
      );
    }
    void usersService.update(userId, updates).catch((error) => {
      logger.error(
        `[GoogleOAuthClient] Failed to persist rotated tokens for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  });

  return client;
}
