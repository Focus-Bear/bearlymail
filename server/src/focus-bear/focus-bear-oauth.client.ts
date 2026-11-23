import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";

import { FOCUS_BEAR_OAUTH } from "../constants/focus-bear.constants";
import { HTTP_HEADERS } from "../constants/http-headers";
import { MILLISECONDS } from "../constants/time-constants";
import { FocusBearOAuthError, FocusBearTokens } from "./focus-bear.types";

const JSON_CONTENT_TYPE = "application/json";

interface OAuthConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  audience: string;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** BearlyMail as an OAuth client of Focus Bear's authorization server (Auth0). */
@Injectable()
export class FocusBearOAuthClient {
  /** False on a deployment (self-hosted, say) that has no Focus Bear client registered. */
  isConfigured(): boolean {
    return this.readConfig() !== null;
  }

  createPkcePair(): PkcePair {
    const verifier = randomBytes(FOCUS_BEAR_OAUTH.CODE_VERIFIER_BYTES).toString(
      "base64url",
    );
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  buildAuthorizeUrl(state: string, codeChallenge: string): string {
    const config = this.requireConfig();
    const url = new URL(FOCUS_BEAR_OAUTH.AUTHORIZE_PATH, config.issuer);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      audience: config.audience,
      scope: FOCUS_BEAR_OAUTH.SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: FOCUS_BEAR_OAUTH.CODE_CHALLENGE_METHOD,
    }).toString();
    return url.toString();
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<FocusBearTokens> {
    const config = this.requireConfig();
    return this.requestTokens(config, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<FocusBearTokens> {
    return this.requestTokens(this.requireConfig(), {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  /** Ends the grant at Focus Bear, so the refresh token is dead even if a copy survives here. */
  async revoke(refreshToken: string): Promise<void> {
    const config = this.requireConfig();
    const response = await this.post(config, FOCUS_BEAR_OAUTH.REVOKE_PATH, {
      token: refreshToken,
    });
    if (!response.ok) {
      throw new FocusBearOAuthError(
        null,
        `Focus Bear responded ${response.status} to the revocation`,
      );
    }
  }

  private async requestTokens(
    config: OAuthConfig,
    grant: Record<string, string>,
  ): Promise<FocusBearTokens> {
    const response = await this.post(
      config,
      FOCUS_BEAR_OAUTH.TOKEN_PATH,
      grant,
    );
    const body = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok) {
      throw new FocusBearOAuthError(
        typeof body.error === "string" ? body.error : null,
        `Focus Bear responded ${response.status} to the ${grant.grant_type} grant`,
      );
    }
    if (
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number"
    ) {
      // Without a refresh token the connection would die with the first access token.
      throw new FocusBearOAuthError(
        null,
        "Focus Bear's token response had no access token, refresh token or expiry",
      );
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * MILLISECONDS.SECOND,
    };
  }

  private post(
    config: OAuthConfig,
    path: string,
    params: Record<string, string>,
  ): Promise<Response> {
    return fetch(new URL(path, config.issuer), {
      method: "POST",
      headers: {
        [HTTP_HEADERS.ACCEPT]: JSON_CONTENT_TYPE,
        [HTTP_HEADERS.CONTENT_TYPE]: JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        ...params,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(FOCUS_BEAR_OAUTH.REQUEST_TIMEOUT_MS),
    });
  }

  private requireConfig(): OAuthConfig {
    const config = this.readConfig();
    if (!config) {
      throw new FocusBearOAuthError(
        null,
        "Focus Bear sign-in is not configured on this server",
      );
    }
    return config;
  }

  private readConfig(): OAuthConfig | null {
    const issuer = process.env[FOCUS_BEAR_OAUTH.ISSUER_ENV];
    const clientId = process.env[FOCUS_BEAR_OAUTH.CLIENT_ID_ENV];
    const clientSecret = process.env[FOCUS_BEAR_OAUTH.CLIENT_SECRET_ENV];
    const redirectUri = process.env[FOCUS_BEAR_OAUTH.REDIRECT_URI_ENV];
    if (!issuer || !clientId || !clientSecret || !redirectUri) {
      return null;
    }
    return {
      // URL resolution drops the last path segment of a base without a trailing slash.
      issuer: issuer.endsWith("/") ? issuer : `${issuer}/`,
      clientId,
      clientSecret,
      redirectUri,
      audience:
        process.env[FOCUS_BEAR_OAUTH.AUDIENCE_ENV] ||
        FOCUS_BEAR_OAUTH.DEFAULT_AUDIENCE,
    };
  }
}
