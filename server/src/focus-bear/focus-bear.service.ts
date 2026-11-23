import { Injectable, Logger } from "@nestjs/common";

import { PROMISE_STATUS } from "../constants/domain-statuses";
import {
  FOCUS_BEAR_OAUTH,
  FOCUS_BEAR_OAUTH_INVALID_GRANT,
  FOCUS_BEAR_REJECTED_TOKEN_STATUSES,
} from "../constants/focus-bear.constants";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import {
  FocusBearApiError,
  FocusBearNextFreeDateResponse,
  FocusBearOAuthError,
  FocusBearProjectSuggestionResponse,
  FocusBearTaskSuggestions,
  FocusBearTaskToFile,
  FocusBearTokens,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

const NOT_CONNECTED: FocusBearTaskSuggestions = {
  connected: false,
  project: null,
  projects: [],
  dueDate: null,
};

const isRejectedToken = (reason: unknown): boolean =>
  reason instanceof FocusBearApiError &&
  FOCUS_BEAR_REJECTED_TOKEN_STATUSES.includes(reason.status);

const isDeadGrant = (reason: unknown): boolean =>
  reason instanceof FocusBearOAuthError &&
  reason.code === FOCUS_BEAR_OAUTH_INVALID_GRANT;

type CachedAccessToken = Pick<FocusBearTokens, "accessToken" | "expiresAt">;

/**
 * The user's Focus Bear connection: they sign in to Focus Bear and consent, and BearlyMail
 * keeps the refresh token (encrypted) to ask Focus Bear which project and day a task saved
 * from an email should get.
 */
@Injectable()
export class FocusBearService {
  private readonly logger = new Logger(FocusBearService.name);
  /** Access tokens live 15 minutes, so they are kept in memory and never stored. */
  private readonly accessTokens = new Map<string, CachedAccessToken>();
  /**
   * A refresh rotates the refresh token, so two at once for one user would leave one of them
   * holding a dead token. Concurrent callers share the refresh already under way.
   */
  private readonly refreshesInFlight = new Map<
    string,
    Promise<string | null>
  >();

  constructor(
    private readonly usersService: UsersService,
    private readonly focusBearApi: FocusBearApiService,
    private readonly oauthClient: FocusBearOAuthClient,
  ) {}

  async isConnected(userId: string): Promise<boolean> {
    return (await this.loadRefreshToken(userId)) !== null;
  }

  /** Finishes the sign-in: trades the authorization code for tokens and keeps the refresh token. */
  async completeConnection(
    userId: string,
    code: string,
    codeVerifier: string,
  ): Promise<void> {
    const tokens = await this.oauthClient.exchangeCode(code, codeVerifier);
    await this.storeTokens(userId, tokens);
  }

  async disconnect(userId: string): Promise<void> {
    const refreshToken = await this.loadRefreshToken(userId);
    this.accessTokens.delete(userId);
    await this.usersService.update(userId, { focusBearRefreshToken: null });
    if (!refreshToken) {
      return;
    }
    try {
      await this.oauthClient.revoke(refreshToken);
    } catch (error) {
      // The token is already gone from here, which is what the user asked for.
      this.logger.warn(
        `Focus Bear grant not revoked: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * A project and due date for a task about to be saved, each null when Focus Bear has
   * none or doesn't answer in time: the save never waits on, or fails because of, them.
   */
  async suggestForTask(
    userId: string,
    task: FocusBearTaskToFile,
  ): Promise<FocusBearTaskSuggestions> {
    const token = await this.getAccessToken(userId);
    if (!token) {
      return NOT_CONNECTED;
    }
    const [projectResult, dateResult] = await Promise.allSettled([
      this.focusBearApi.suggestProject(token, task),
      this.focusBearApi.nextFreeDate(token),
    ]);
    if (
      isRejectedToken(this.reasonOf(projectResult)) &&
      isRejectedToken(this.reasonOf(dateResult))
    ) {
      this.accessTokens.delete(userId);
      return NOT_CONNECTED;
    }
    this.logFailure(projectResult, "project");
    this.logFailure(dateResult, "due date");
    const projectSuggestion =
      this.valueOf<FocusBearProjectSuggestionResponse>(projectResult);
    const nextFreeDate =
      this.valueOf<FocusBearNextFreeDateResponse>(dateResult);
    return {
      connected: true,
      project: projectSuggestion?.project ?? null,
      projects: projectSuggestion?.projects ?? [],
      dueDate: nextFreeDate?.date ?? null,
    };
  }

  /** Null when the user isn't connected, or Focus Bear can't be reached to refresh. */
  private async getAccessToken(userId: string): Promise<string | null> {
    const cached = this.accessTokens.get(userId);
    if (
      cached &&
      cached.expiresAt - FOCUS_BEAR_OAUTH.EXPIRY_MARGIN_MS > Date.now()
    ) {
      return cached.accessToken;
    }
    const inFlight = this.refreshesInFlight.get(userId);
    if (inFlight) {
      return inFlight;
    }
    const refresh = this.refreshAccessToken(userId).finally(() =>
      this.refreshesInFlight.delete(userId),
    );
    this.refreshesInFlight.set(userId, refresh);
    return refresh;
  }

  private async refreshAccessToken(userId: string): Promise<string | null> {
    const refreshToken = await this.loadRefreshToken(userId);
    if (!refreshToken) {
      return null;
    }
    try {
      const tokens = await this.oauthClient.refresh(refreshToken);
      await this.storeTokens(userId, tokens);
      return tokens.accessToken;
    } catch (error) {
      if (isDeadGrant(error)) {
        // Revoked in Focus Bear, or expired: only signing in again brings it back.
        await this.usersService.update(userId, { focusBearRefreshToken: null });
        return null;
      }
      this.logger.warn(
        `Focus Bear token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async storeTokens(
    userId: string,
    tokens: FocusBearTokens,
  ): Promise<void> {
    await this.usersService.update(userId, {
      focusBearRefreshToken: tokens.refreshToken,
    });
    this.accessTokens.set(userId, {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    });
  }

  private async loadRefreshToken(userId: string): Promise<string | null> {
    const user = await this.usersService.findOneWithFocusBearToken(userId);
    return EncryptionHelper.tryDecrypt(user?.focusBearRefreshToken) || null;
  }

  private valueOf<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === PROMISE_STATUS.FULFILLED ? result.value : null;
  }

  private reasonOf(result: PromiseSettledResult<unknown>): unknown {
    return result.status === PROMISE_STATUS.REJECTED ? result.reason : null;
  }

  private logFailure(
    result: PromiseSettledResult<unknown>,
    suggestion: string,
  ): void {
    if (result.status === PROMISE_STATUS.FULFILLED) {
      return;
    }
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    this.logger.warn(
      `Focus Bear ${suggestion} suggestion unavailable: ${message}`,
    );
  }
}
