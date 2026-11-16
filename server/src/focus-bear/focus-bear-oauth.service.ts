import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { CookieOptions, Request, Response } from "express";

import {
  createFocusBearConnectState,
  parseSignedOAuthState,
  readCookie,
} from "../auth/oauth-state.util";
import { AUTH_ACTION_TYPES, NODE_ENV_VALUES } from "../constants/domain-types";
import {
  FOCUS_BEAR_CONNECT_RESULTS,
  FOCUS_BEAR_OAUTH,
  FocusBearConnectResult,
} from "../constants/focus-bear.constants";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

/** Root, like the mailbox connect-binding cookie: the callback path can sit behind a proxy prefix. */
const COOKIE_PATH = "/";
const NOT_CONFIGURED_MESSAGE =
  "Connecting Focus Bear isn't set up on this BearlyMail server.";

/** What Focus Bear's Auth0 sent to the callback; any of it can be missing or repeated. */
export interface FocusBearCallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const toCodeChallenge = (codeVerifier: string): string =>
  createHash("sha256").update(codeVerifier).digest("base64url");

const isSameString = (expected: string, provided: string): boolean => {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
};

/**
 * "Connect Focus Bear": authorization code + PKCE against Focus Bear's Auth0.
 *
 * The PKCE verifier lives in an HttpOnly cookie on the browser that started the
 * flow, and the signed state carries its challenge. A callback is accepted only
 * when the state verifies AND this browser's cookie hashes to its challenge, so
 * a connect link handed to someone else can't put their Focus Bear account on
 * the sender's BearlyMail account.
 */
@Injectable()
export class FocusBearOAuthService {
  private readonly logger = new Logger(FocusBearOAuthService.name);

  constructor(
    private readonly oauthClient: FocusBearOAuthClient,
    private readonly credentials: FocusBearCredentialsService,
  ) {}

  /** The Focus Bear sign-in URL for this user; sets the verifier cookie on `res`. */
  beginConnect(userId: string, res: Response): string {
    if (!this.oauthClient.isConfigured()) {
      throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    }
    const codeVerifier = randomBytes(
      FOCUS_BEAR_OAUTH.CODE_VERIFIER_BYTES,
    ).toString("base64url");
    const codeChallenge = toCodeChallenge(codeVerifier);
    res.cookie(
      FOCUS_BEAR_OAUTH.VERIFIER_COOKIE,
      codeVerifier,
      this.verifierCookieOptions(),
    );
    return this.oauthClient.authorizationUrl(
      createFocusBearConnectState(userId, codeChallenge),
      codeChallenge,
    );
  }

  /** Finishes the flow and says how it went; never throws, the browser is mid-redirect. */
  async completeConnect(
    query: FocusBearCallbackQuery,
    req: Pick<Request, "headers">,
    res: Response,
  ): Promise<FocusBearConnectResult> {
    const codeVerifier = readCookie(req, FOCUS_BEAR_OAUTH.VERIFIER_COOKIE);
    res.clearCookie(
      FOCUS_BEAR_OAUTH.VERIFIER_COOKIE,
      this.clearCookieOptions(),
    );
    const error = asString(query.error);
    if (error === FOCUS_BEAR_OAUTH.ACCESS_DENIED_ERROR) {
      return FOCUS_BEAR_CONNECT_RESULTS.CANCELLED;
    }
    const userId = this.userIdForCallback(asString(query.state), codeVerifier);
    if (!userId || !codeVerifier) {
      return FOCUS_BEAR_CONNECT_RESULTS.EXPIRED;
    }
    const code = asString(query.code);
    if (error || !code) {
      return FOCUS_BEAR_CONNECT_RESULTS.FAILED;
    }
    try {
      const tokens = await this.oauthClient.exchangeCode(code, codeVerifier);
      await this.credentials.saveOAuthTokens(userId, tokens);
      return FOCUS_BEAR_CONNECT_RESULTS.CONNECTED;
    } catch (error) {
      this.logger.warn(
        `Connecting Focus Bear failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return FOCUS_BEAR_CONNECT_RESULTS.FAILED;
    }
  }

  /** The user who started this flow, when the state is genuine and this browser started it. */
  private userIdForCallback(
    state: string | undefined,
    codeVerifier: string | null,
  ): string | null {
    const parsed = state ? parseSignedOAuthState(state) : null;
    if (
      !parsed ||
      parsed.action !== AUTH_ACTION_TYPES.CONNECT_FOCUS_BEAR ||
      !parsed.nonce ||
      !codeVerifier
    ) {
      return null;
    }
    return isSameString(parsed.nonce, toCodeChallenge(codeVerifier))
      ? parsed.userId
      : null;
  }

  private verifierCookieOptions(): CookieOptions {
    return {
      ...this.clearCookieOptions(),
      maxAge: FOCUS_BEAR_OAUTH.VERIFIER_COOKIE_MAX_AGE_MS,
    };
  }

  /** Lax, not Strict: the callback arrives as a top-level redirect from Focus Bear's sign-in. */
  private clearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION,
      sameSite: "lax",
      path: COOKIE_PATH,
    };
  }
}
