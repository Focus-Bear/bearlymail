import { Injectable } from "@nestjs/common";

import { FOCUS_BEAR_OAUTH } from "../constants/focus-bear.constants";
import { HTTP_HEADERS } from "../constants/http-headers";
import {
  FocusBearOAuthError,
  FocusBearOAuthTokenResponse,
} from "./focus-bear.types";
import {
  FocusBearOAuthConfig,
  readFocusBearOAuthConfig,
} from "./focus-bear-oauth.config";

const JSON_CONTENT_TYPE = "application/json";
const NOT_CONFIGURED_MESSAGE = "Focus Bear sign-in is not configured";

/** Focus Bear's Auth0 tenant: the authorize URL, the token endpoint and revocation. */
@Injectable()
export class FocusBearOAuthClient {
  isConfigured(): boolean {
    return readFocusBearOAuthConfig() !== null;
  }

  authorizationUrl(state: string, codeChallenge: string): string {
    const config = this.requireConfig();
    const url = new URL(
      `${config.issuerOrigin}${FOCUS_BEAR_OAUTH.AUTHORIZE_PATH}`,
    );
    url.search = new URLSearchParams({
      response_type: FOCUS_BEAR_OAUTH.RESPONSE_TYPE,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      audience: config.audience,
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: FOCUS_BEAR_OAUTH.CODE_CHALLENGE_METHOD,
    }).toString();
    return url.toString();
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<FocusBearOAuthTokenResponse> {
    const config = this.requireConfig();
    return this.requestToken(config, {
      grant_type: FOCUS_BEAR_OAUTH.GRANT_TYPES.AUTHORIZATION_CODE,
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<FocusBearOAuthTokenResponse> {
    return this.requestToken(this.requireConfig(), {
      grant_type: FOCUS_BEAR_OAUTH.GRANT_TYPES.REFRESH_TOKEN,
      refresh_token: refreshToken,
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    const config = this.requireConfig();
    const response = await this.post(config, FOCUS_BEAR_OAUTH.REVOKE_PATH, {
      token: refreshToken,
    });
    if (!response.ok) {
      throw new FocusBearOAuthError(
        null,
        `Focus Bear revocation responded ${response.status}`,
      );
    }
  }

  private async requestToken(
    config: FocusBearOAuthConfig,
    params: Record<string, string>,
  ): Promise<FocusBearOAuthTokenResponse> {
    const response = await this.post(
      config,
      FOCUS_BEAR_OAUTH.TOKEN_PATH,
      params,
    );
    const body = (await response.json().catch(() => ({}))) as Partial<
      FocusBearOAuthTokenResponse & { error: string }
    >;
    if (!response.ok || typeof body.access_token !== "string") {
      throw new FocusBearOAuthError(
        typeof body.error === "string" ? body.error : null,
        `Focus Bear token endpoint responded ${response.status}`,
      );
    }
    return body as FocusBearOAuthTokenResponse;
  }

  /** Auth0's endpoints take the client credentials in a JSON body. */
  private post(
    config: FocusBearOAuthConfig,
    path: string,
    params: Record<string, string>,
  ): Promise<Response> {
    return fetch(`${config.issuerOrigin}${path}`, {
      method: "POST",
      headers: {
        [HTTP_HEADERS.ACCEPT]: JSON_CONTENT_TYPE,
        [HTTP_HEADERS.CONTENT_TYPE]: JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...params,
      }),
      signal: AbortSignal.timeout(FOCUS_BEAR_OAUTH.REQUEST_TIMEOUT_MS),
    });
  }

  private requireConfig(): FocusBearOAuthConfig {
    const config = readFocusBearOAuthConfig();
    if (!config) {
      throw new FocusBearOAuthError(null, NOT_CONFIGURED_MESSAGE);
    }
    return config;
  }
}
