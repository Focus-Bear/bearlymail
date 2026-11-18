import { Injectable, Logger } from "@nestjs/common";

import {
  FOCUS_BEAR_CONNECTION_METHODS,
  FOCUS_BEAR_OAUTH,
} from "../constants/focus-bear.constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import {
  FocusBearConnectionStatus,
  FocusBearCredential,
  FocusBearOAuthError,
  FocusBearOAuthTokenResponse,
} from "./focus-bear.types";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

type FocusBearCredentialColumns = Pick<
  User,
  | "focusBearApiToken"
  | "focusBearRefreshToken"
  | "focusBearAccessToken"
  | "focusBearAccessTokenRenewAt"
>;

const CLEARED_OAUTH_COLUMNS: Omit<
  FocusBearCredentialColumns,
  "focusBearApiToken"
> = {
  focusBearRefreshToken: null,
  focusBearAccessToken: null,
  focusBearAccessTokenRenewAt: null,
};

const decrypt = (value: string | null | undefined): string | null =>
  EncryptionHelper.tryDecrypt(value) || null;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Where BearlyMail keeps the user's Focus Bear access: the Connect Focus Bear
 * refresh token (and the access token it last produced), or a token pasted in
 * before sign-in existed. Sign-in wins when both exist; a pasted token keeps
 * working until the user connects with sign-in or disconnects.
 */
@Injectable()
export class FocusBearCredentialsService {
  private readonly logger = new Logger(FocusBearCredentialsService.name);
  /**
   * Renewals in flight, by user. Auth0 rotates refresh tokens and treats a
   * second use of the old one as theft, so two saves at once must share one.
   */
  private readonly renewals = new Map<string, Promise<string | null>>();

  constructor(
    private readonly usersService: UsersService,
    private readonly oauthClient: FocusBearOAuthClient,
  ) {}

  async status(userId: string): Promise<FocusBearConnectionStatus> {
    const columns = await this.load(userId);
    const method = this.methodOf(columns);
    return {
      connected: method !== null,
      method,
      oauthAvailable: this.oauthClient.isConfigured(),
    };
  }

  /**
   * An access token to call Focus Bear with, renewed first when it's due (or
   * when `forceRenewal` says Focus Bear just refused it). Null when the user
   * isn't connected or their sign-in can no longer be renewed.
   */
  async resolve(
    userId: string,
    { forceRenewal = false }: { forceRenewal?: boolean } = {},
  ): Promise<FocusBearCredential | null> {
    const columns = await this.load(userId);
    const refreshToken = decrypt(columns?.focusBearRefreshToken);
    if (refreshToken) {
      return this.resolveOAuth(userId, columns, refreshToken, forceRenewal);
    }
    const pastedToken = decrypt(columns?.focusBearApiToken);
    return pastedToken
      ? {
          method: FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN,
          accessToken: pastedToken,
        }
      : null;
  }

  /** Replaces any earlier connection, including a pasted token. */
  async saveOAuthTokens(
    userId: string,
    tokens: FocusBearOAuthTokenResponse,
  ): Promise<void> {
    if (!tokens.refresh_token) {
      throw new FocusBearOAuthError(
        null,
        "Focus Bear issued no refresh token; is offline access allowed for this app?",
      );
    }
    await this.usersService.update(userId, {
      focusBearApiToken: null,
      focusBearRefreshToken: tokens.refresh_token,
      ...this.accessTokenColumns(tokens),
    });
  }

  /** Revokes the refresh token at Focus Bear on a best-effort basis; the local copy goes regardless. */
  async disconnect(userId: string): Promise<void> {
    const refreshToken = decrypt(
      (await this.load(userId))?.focusBearRefreshToken,
    );
    await this.usersService.update(userId, {
      focusBearApiToken: null,
      ...CLEARED_OAUTH_COLUMNS,
    });
    if (refreshToken) {
      await this.oauthClient.revoke(refreshToken).catch((error: unknown) => {
        this.logger.warn(
          `Couldn't revoke the Focus Bear refresh token: ${errorMessage(error)}`,
        );
      });
    }
  }

  private async resolveOAuth(
    userId: string,
    columns: FocusBearCredentialColumns | null,
    refreshToken: string,
    forceRenewal: boolean,
  ): Promise<FocusBearCredential | null> {
    const cachedToken = decrypt(columns?.focusBearAccessToken);
    const renewAt = columns?.focusBearAccessTokenRenewAt;
    const isCachedTokenFresh =
      cachedToken !== null && renewAt != null && renewAt.getTime() > Date.now();
    if (isCachedTokenFresh && !forceRenewal) {
      return {
        method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
        accessToken: cachedToken,
      };
    }
    const accessToken = await this.renewOnce(userId, refreshToken);
    return accessToken
      ? { method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH, accessToken }
      : null;
  }

  private renewOnce(
    userId: string,
    refreshToken: string,
  ): Promise<string | null> {
    const inFlight = this.renewals.get(userId);
    if (inFlight) {
      return inFlight;
    }
    const renewal = this.renew(userId, refreshToken).finally(() =>
      this.renewals.delete(userId),
    );
    this.renewals.set(userId, renewal);
    return renewal;
  }

  /**
   * A refused refresh token (revoked, or dead from sitting idle) ends the
   * connection: Settings then shows Connect again. Any other failure (Focus
   * Bear down, a timeout) leaves it for the next attempt.
   */
  private async renew(
    userId: string,
    refreshToken: string,
  ): Promise<string | null> {
    try {
      const tokens = await this.oauthClient.refresh(refreshToken);
      await this.usersService.update(userId, {
        focusBearRefreshToken: tokens.refresh_token ?? refreshToken,
        ...this.accessTokenColumns(tokens),
      });
      return tokens.access_token;
    } catch (error) {
      if (
        error instanceof FocusBearOAuthError &&
        error.oauthError === FOCUS_BEAR_OAUTH.INVALID_GRANT_ERROR
      ) {
        this.logger.warn(
          `Focus Bear refused the refresh token for user ${userId}; the user must connect again`,
        );
        await this.usersService.update(userId, CLEARED_OAUTH_COLUMNS);
        return null;
      }
      throw error;
    }
  }

  private accessTokenColumns(
    tokens: FocusBearOAuthTokenResponse,
  ): Pick<User, "focusBearAccessToken" | "focusBearAccessTokenRenewAt"> {
    return {
      focusBearAccessToken: tokens.access_token,
      focusBearAccessTokenRenewAt: new Date(this.renewAtMs(tokens.expires_in)),
    };
  }

  private renewAtMs(expiresInSeconds: number | undefined): number {
    const now = Date.now();
    const latest = now + FOCUS_BEAR_OAUTH.MAX_ACCESS_TOKEN_AGE_MS;
    if (expiresInSeconds === undefined) {
      return latest;
    }
    const beforeExpiry =
      now + expiresInSeconds * MS_PER_SECOND - FOCUS_BEAR_OAUTH.EXPIRY_SKEW_MS;
    return Math.min(latest, beforeExpiry);
  }

  private methodOf(
    columns: FocusBearCredentialColumns | null,
  ): FocusBearConnectionStatus["method"] {
    if (decrypt(columns?.focusBearRefreshToken)) {
      return FOCUS_BEAR_CONNECTION_METHODS.OAUTH;
    }
    if (decrypt(columns?.focusBearApiToken)) {
      return FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN;
    }
    return null;
  }

  private load(userId: string): Promise<FocusBearCredentialColumns | null> {
    return this.usersService.findOneWithFocusBearCredentials(userId);
  }
}
