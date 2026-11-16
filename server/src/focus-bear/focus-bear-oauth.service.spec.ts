import { ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "crypto";
import type { Response } from "express";

import {
  createConnectState,
  createFocusBearConnectState,
} from "../auth/oauth-state.util";
import {
  FOCUS_BEAR_CONNECT_RESULTS,
  FOCUS_BEAR_OAUTH,
} from "../constants/focus-bear.constants";
import { FocusBearOAuthError } from "./focus-bear.types";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";
import { FocusBearOAuthService } from "./focus-bear-oauth.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const TOKENS = { access_token: "access-1", refresh_token: "refresh-1" };

const challengeOf = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

const fakeResponse = () => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

const requestWithVerifier = (verifier: string | null) => ({
  headers: verifier
    ? { cookie: `other=1; ${FOCUS_BEAR_OAUTH.VERIFIER_COOKIE}=${verifier}` }
    : {},
});

describe("FocusBearOAuthService", () => {
  const originalSecret = process.env.JWT_SECRET;
  let oauthClient: {
    isConfigured: jest.Mock;
    authorizationUrl: jest.Mock;
    exchangeCode: jest.Mock;
  };
  let credentials: { saveOAuthTokens: jest.Mock };
  let service: FocusBearOAuthService;

  beforeAll(() => {
    process.env.JWT_SECRET = "focus-bear-oauth-spec-secret";
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    oauthClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      authorizationUrl: jest.fn(
        (state: string, challenge: string) =>
          `https://auth.example/authorize?state=${state}&code_challenge=${challenge}`,
      ),
      exchangeCode: jest.fn().mockResolvedValue(TOKENS),
    };
    credentials = { saveOAuthTokens: jest.fn().mockResolvedValue(undefined) };
    service = new FocusBearOAuthService(
      oauthClient as unknown as FocusBearOAuthClient,
      credentials as unknown as FocusBearCredentialsService,
    );
  });

  /** Runs beginConnect and returns what the browser then holds: the verifier cookie and the state. */
  const startFlow = () => {
    const res = fakeResponse();
    service.beginConnect(USER_ID, res as unknown as Response);
    const [cookieName, verifier, options] = res.cookie.mock.calls[0];
    const [state, challenge] = oauthClient.authorizationUrl.mock.calls[0];
    return { cookieName, verifier, options, state, challenge };
  };

  const complete = (
    query: Record<string, unknown>,
    verifier: string | null,
    res = fakeResponse(),
  ) =>
    service.completeConnect(
      query,
      requestWithVerifier(verifier),
      res as unknown as Response,
    );

  describe("beginConnect", () => {
    it("keeps the PKCE verifier in an HttpOnly cookie and sends only its challenge", () => {
      const { cookieName, verifier, options, challenge } = startFlow();

      expect(cookieName).toBe(FOCUS_BEAR_OAUTH.VERIFIER_COOKIE);
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax" });
      expect(challenge).toBe(challengeOf(verifier));
      expect(oauthClient.authorizationUrl.mock.calls[0][0]).not.toContain(
        verifier,
      );
    });

    it("refuses to start when this server has no Focus Bear app configured", () => {
      oauthClient.isConfigured.mockReturnValue(false);

      expect(() =>
        service.beginConnect(USER_ID, fakeResponse() as unknown as Response),
      ).toThrow(ServiceUnavailableException);
    });
  });

  describe("completeConnect", () => {
    it("exchanges the code with the verifier and saves the tokens for the user who started", async () => {
      const { verifier, state } = startFlow();
      const res = fakeResponse();

      await expect(
        complete({ code: "code-1", state }, verifier, res),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.CONNECTED);
      expect(oauthClient.exchangeCode).toHaveBeenCalledWith("code-1", verifier);
      expect(credentials.saveOAuthTokens).toHaveBeenCalledWith(USER_ID, TOKENS);
      expect(res.clearCookie).toHaveBeenCalledWith(
        FOCUS_BEAR_OAUTH.VERIFIER_COOKIE,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("rejects a callback in a browser that didn't start the flow", async () => {
      const { state } = startFlow();

      await expect(complete({ code: "code-1", state }, null)).resolves.toBe(
        FOCUS_BEAR_CONNECT_RESULTS.EXPIRED,
      );
      await expect(
        complete({ code: "code-1", state }, "someone-elses-verifier"),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.EXPIRED);
      expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
    });

    it("rejects a state whose user was swapped", async () => {
      const { verifier, state } = startFlow();
      const [body, signature] = state.split(".");
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      const forged = `${Buffer.from(
        JSON.stringify({ ...payload, userId: OTHER_USER_ID }),
      ).toString("base64url")}.${signature}`;

      await expect(
        complete({ code: "code-1", state: forged }, verifier),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.EXPIRED);
      expect(credentials.saveOAuthTokens).not.toHaveBeenCalled();
    });

    it("rejects a genuine state minted for a different flow", async () => {
      const verifier = "verifier-for-mailbox";
      const mailboxState = createConnectState(
        USER_ID,
        fakeResponse() as unknown as Response,
      );

      await expect(
        complete({ code: "code-1", state: mailboxState }, verifier),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.EXPIRED);
    });

    it("accepts a state only with the verifier its challenge was made from", async () => {
      const verifier = "a-verifier-value";
      const state = createFocusBearConnectState(USER_ID, challengeOf(verifier));

      await expect(complete({ code: "code-1", state }, verifier)).resolves.toBe(
        FOCUS_BEAR_CONNECT_RESULTS.CONNECTED,
      );
    });

    it("reports a cancelled sign-in as cancelled", async () => {
      const { verifier, state } = startFlow();

      await expect(
        complete(
          { error: FOCUS_BEAR_OAUTH.ACCESS_DENIED_ERROR, state },
          verifier,
        ),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.CANCELLED);
      expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
    });

    it("fails without a code, and when a code arrives more than once", async () => {
      const { verifier, state } = startFlow();

      await expect(complete({ state }, verifier)).resolves.toBe(
        FOCUS_BEAR_CONNECT_RESULTS.FAILED,
      );
      await expect(
        complete({ code: ["code-1", "code-2"], state }, verifier),
      ).resolves.toBe(FOCUS_BEAR_CONNECT_RESULTS.FAILED);
      expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
    });

    it("fails, saving nothing, when Focus Bear refuses the code", async () => {
      const { verifier, state } = startFlow();
      oauthClient.exchangeCode.mockRejectedValue(
        new FocusBearOAuthError("invalid_grant", "responded 403"),
      );

      await expect(complete({ code: "code-1", state }, verifier)).resolves.toBe(
        FOCUS_BEAR_CONNECT_RESULTS.FAILED,
      );
      expect(credentials.saveOAuthTokens).not.toHaveBeenCalled();
    });
  });
});
