import { createHash } from "crypto";

import { FOCUS_BEAR_OAUTH } from "../constants/focus-bear.constants";
import { FocusBearOAuthError } from "./focus-bear.types";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

const ISSUER = "https://tenant.example/";
const CLIENT_ID = "bearlymail-client";
const CLIENT_SECRET = "client-secret";
const REDIRECT_URI = "https://api.bearlymail.example/focus-bear/oauth/callback";
const EXPIRES_IN_SECONDS = 900;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FocusBearOAuthClient", () => {
  const client = new FocusBearOAuthClient();
  let fetchMock: jest.SpyInstance;

  const sentBody = (): Record<string, string> =>
    JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);

  beforeEach(() => {
    process.env[FOCUS_BEAR_OAUTH.ISSUER_ENV] = ISSUER;
    process.env[FOCUS_BEAR_OAUTH.CLIENT_ID_ENV] = CLIENT_ID;
    process.env[FOCUS_BEAR_OAUTH.CLIENT_SECRET_ENV] = CLIENT_SECRET;
    process.env[FOCUS_BEAR_OAUTH.REDIRECT_URI_ENV] = REDIRECT_URI;
    delete process.env[FOCUS_BEAR_OAUTH.AUDIENCE_ENV];
    fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: EXPIRES_IN_SECONDS,
      }),
    );
  });

  afterEach(() => {
    fetchMock.mockRestore();
    for (const name of [
      FOCUS_BEAR_OAUTH.ISSUER_ENV,
      FOCUS_BEAR_OAUTH.CLIENT_ID_ENV,
      FOCUS_BEAR_OAUTH.CLIENT_SECRET_ENV,
      FOCUS_BEAR_OAUTH.REDIRECT_URI_ENV,
    ]) {
      delete process.env[name];
    }
  });

  it("is configured only when the issuer, client and redirect are all set", () => {
    expect(client.isConfigured()).toBe(true);
    delete process.env[FOCUS_BEAR_OAUTH.CLIENT_SECRET_ENV];
    expect(client.isConfigured()).toBe(false);
  });

  it("derives the PKCE challenge from the verifier with SHA-256", () => {
    const { verifier, challenge } = client.createPkcePair();

    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
    expect(client.createPkcePair().verifier).not.toBe(verifier);
  });

  it("sends the user to authorize for the suggestions scope on the Focus Bear audience, without openid", () => {
    const url = new URL(client.buildAuthorizeUrl("signed-state", "challenge"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://tenant.example/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      audience: FOCUS_BEAR_OAUTH.DEFAULT_AUDIENCE,
      scope: "mcp.suggestions.read offline_access",
      state: "signed-state",
      code_challenge: "challenge",
      code_challenge_method: "S256",
    });
  });

  it("exchanges the code with the PKCE verifier and the client secret", async () => {
    const before = Date.now();

    const tokens = await client.exchangeCode("auth-code", "verifier");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://tenant.example/oauth/token",
    );
    expect(sentBody()).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    expect(tokens.accessToken).toBe("access");
    expect(tokens.refreshToken).toBe("refresh");
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(
      before + EXPIRES_IN_SECONDS * 1000,
    );
  });

  it("refreshes with the refresh token", async () => {
    await client.refresh("old-refresh");

    expect(sentBody()).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
  });

  it("reports the OAuth error code when the grant is refused", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: "invalid_grant", error_description: "x" }),
    );

    await expect(client.refresh("old-refresh")).rejects.toMatchObject({
      name: "FocusBearOAuthError",
      code: "invalid_grant",
    });
  });

  it("refuses a token response without a refresh token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        access_token: "access",
        expires_in: EXPIRES_IN_SECONDS,
      }),
    );

    await expect(
      client.exchangeCode("auth-code", "verifier"),
    ).rejects.toBeInstanceOf(FocusBearOAuthError);
  });

  it("revokes a refresh token, and throws when Focus Bear refuses", async () => {
    await client.revoke("refresh");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://tenant.example/oauth/revoke",
    );
    expect(sentBody()).toMatchObject({
      token: "refresh",
      client_id: CLIENT_ID,
    });

    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(client.revoke("refresh")).rejects.toBeInstanceOf(
      FocusBearOAuthError,
    );
  });

  it("refuses to start a sign-in when not configured", () => {
    delete process.env[FOCUS_BEAR_OAUTH.ISSUER_ENV];

    expect(() => client.buildAuthorizeUrl("state", "challenge")).toThrow(
      "not configured",
    );
  });
});
