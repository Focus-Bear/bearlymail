import {
  FOCUS_BEAR_OAUTH,
  FOCUS_BEAR_OAUTH_ENV,
} from "../constants/focus-bear.constants";
import { FocusBearOAuthError } from "./focus-bear.types";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";
import { readFocusBearOAuthConfig } from "./focus-bear-oauth.config";

const CONFIG_ENV = {
  [FOCUS_BEAR_OAUTH_ENV.DOMAIN]: "auth.focusbear.example",
  [FOCUS_BEAR_OAUTH_ENV.CLIENT_ID]: "client-1",
  [FOCUS_BEAR_OAUTH_ENV.CLIENT_SECRET]: "secret-1",
  [FOCUS_BEAR_OAUTH_ENV.AUDIENCE]: "https://api.focusbear.example/",
  [FOCUS_BEAR_OAUTH_ENV.REDIRECT_URI]:
    "https://api.bearlymail.example/focus-bear/oauth/callback",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readFocusBearOAuthConfig", () => {
  it("is null until every required value is set", () => {
    const { [FOCUS_BEAR_OAUTH_ENV.CLIENT_SECRET]: _secret, ...withoutSecret } =
      CONFIG_ENV;

    expect(readFocusBearOAuthConfig(withoutSecret)).toBeNull();
    expect(readFocusBearOAuthConfig(CONFIG_ENV)).not.toBeNull();
  });

  it("accepts the domain with or without a scheme and defaults the scope and callback", () => {
    const config = readFocusBearOAuthConfig({
      ...CONFIG_ENV,
      [FOCUS_BEAR_OAUTH_ENV.DOMAIN]: "https://auth.focusbear.example/",
      [FOCUS_BEAR_OAUTH_ENV.REDIRECT_URI]: "",
    });

    expect(config).toMatchObject({
      issuerOrigin: "https://auth.focusbear.example",
      scope: FOCUS_BEAR_OAUTH.DEFAULT_SCOPE,
    });
    expect(config?.redirectUri).toMatch(/\/focus-bear\/oauth\/callback$/);
  });
});

describe("FocusBearOAuthClient", () => {
  const client = new FocusBearOAuthClient();
  const savedEnv = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    Object.assign(process.env, CONFIG_ENV);
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...savedEnv };
  });

  const postedBody = (callIndex = 0): Record<string, string> =>
    JSON.parse((fetchMock.mock.calls[callIndex][1] as { body: string }).body);

  it("builds an authorize URL for the Focus Bear API with PKCE and the state", () => {
    const url = new URL(client.authorizationUrl("state-1", "challenge-1"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://auth.focusbear.example/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-1",
      redirect_uri: CONFIG_ENV[FOCUS_BEAR_OAUTH_ENV.REDIRECT_URI],
      audience: "https://api.focusbear.example/",
      scope: FOCUS_BEAR_OAUTH.DEFAULT_SCOPE,
      state: "state-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
    });
  });

  it("exchanges the code with the verifier and the client credentials", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: "access-1", refresh_token: "r-1" }),
    );

    await expect(client.exchangeCode("code-1", "verifier-1")).resolves.toEqual({
      access_token: "access-1",
      refresh_token: "r-1",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://auth.focusbear.example/oauth/token",
    );
    expect(postedBody()).toEqual({
      client_id: "client-1",
      client_secret: "secret-1",
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
      redirect_uri: CONFIG_ENV[FOCUS_BEAR_OAUTH_ENV.REDIRECT_URI],
    });
  });

  it("reports a refused refresh token as invalid_grant", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        error: "invalid_grant",
        error_description: "Unknown or invalid refresh token.",
      }),
    );

    const error = await client
      .refresh("refresh-1")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FocusBearOAuthError);
    expect((error as FocusBearOAuthError).oauthError).toBe("invalid_grant");
    expect(postedBody()).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "refresh-1",
    });
  });

  it("revokes a refresh token at Focus Bear", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await client.revoke("refresh-1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://auth.focusbear.example/oauth/revoke",
    );
    expect(postedBody()).toMatchObject({ token: "refresh-1" });
  });

  it("is unconfigured, and refuses to call out, without the app's settings", async () => {
    delete process.env[FOCUS_BEAR_OAUTH_ENV.CLIENT_ID];

    expect(client.isConfigured()).toBe(false);
    await expect(client.refresh("refresh-1")).rejects.toBeInstanceOf(
      FocusBearOAuthError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
