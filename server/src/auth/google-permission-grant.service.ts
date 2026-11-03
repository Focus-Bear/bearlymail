import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import {
  GOOGLE_PERMISSION_GROUP,
  hasGooglePermission,
  isIncrementalGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import {
  buildGrantReturnUrl,
  GOOGLE_PERMISSION_RESULT,
  GooglePermissionResult,
} from "./google-permission-grant";
import { ParsedOAuthState } from "./oauth-state.util";

/** What GoogleStrategy.validate hands the callback after a grant. */
export interface GoogleGrantCallbackUser {
  id?: string;
  googleGrantedScopes?: string | null;
  googleId?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
}

/**
 * Finishes an incremental Google grant on the OAuth callback. GoogleStrategy
 * has already stored the new tokens and the full granted-scope list on the
 * user; this checks the grant landed on the signed-in user, carries the new
 * tokens to the linked Google account row (old refresh tokens keep their old
 * scopes), and starts the contact import once contacts are granted.
 */
@Injectable()
export class GooglePermissionGrantService {
  private readonly logger = new Logger(GooglePermissionGrantService.name);

  constructor(
    private readonly googleAccountsService: GoogleAccountsService,
    private readonly userEncryptionService: UserEncryptionService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /** Returns the app URL to send the browser back to, tagged with the outcome. */
  async completeGrant(
    state: ParsedOAuthState,
    googleUser: GoogleGrantCallbackUser,
    frontendUrl: string,
  ): Promise<string> {
    const result = await this.applyGrant(state, googleUser);
    return buildGrantReturnUrl(frontendUrl, state.returnTo, result);
  }

  private async applyGrant(
    state: ParsedOAuthState,
    googleUser: GoogleGrantCallbackUser,
  ): Promise<GooglePermissionResult> {
    if (googleUser.id !== state.userId) {
      this.logger.warn(
        `Google permission grant for user ${state.userId} came back signed in as a different account`,
      );
      return GOOGLE_PERMISSION_RESULT.WRONG_ACCOUNT;
    }
    if (!isIncrementalGooglePermissionGroup(state.permission)) {
      return GOOGLE_PERMISSION_RESULT.DECLINED;
    }
    if (
      !hasGooglePermission(googleUser.googleGrantedScopes, state.permission)
    ) {
      return GOOGLE_PERMISSION_RESULT.DECLINED;
    }
    await this.refreshLinkedAccountTokens(state.userId, googleUser);
    if (state.permission === GOOGLE_PERMISSION_GROUP.CONTACTS) {
      this.queueContactImport(state.userId);
    }
    return GOOGLE_PERMISSION_RESULT.GRANTED;
  }

  /**
   * Runs under withUserKey for the same reason AuthController's connect flow
   * does: callbacks are unauthenticated, so account tokens would otherwise be
   * read and written under the wrong encryption key.
   */
  private async refreshLinkedAccountTokens(
    userId: string,
    googleUser: GoogleGrantCallbackUser,
  ): Promise<void> {
    const { googleId, googleAccessToken, googleRefreshToken } = googleUser;
    if (!googleId || !googleAccessToken) return;
    await this.userEncryptionService.withUserKey(userId, async () => {
      const accounts = await this.googleAccountsService.findAllByUser(userId);
      const linked = accounts.find((account) => account.googleId === googleId);
      if (!linked) return;
      await this.googleAccountsService.updateTokens(
        linked.id,
        userId,
        googleAccessToken,
        googleRefreshToken,
      );
    });
  }

  /**
   * No singletonSeconds: a throttled send would be swallowed by the sync that
   * ran (without the contacts scope) moments ago at sign-in. singletonKey
   * alone still dedupes against an in-flight sync.
   */
  private queueContactImport(userId: string): void {
    this.boss
      .send(
        JOB_NAMES.SYNC_CONTACTS,
        { userId },
        { singletonKey: `sync-contacts-${userId}` },
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to queue contact import after Google contacts grant for user ${userId}: ${err}`,
        );
      });
  }
}
