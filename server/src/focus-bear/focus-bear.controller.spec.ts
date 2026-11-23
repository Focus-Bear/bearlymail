import { ServiceUnavailableException } from "@nestjs/common";
import type { Request, Response } from "express";

import {
  CONNECT_BINDING_COOKIE,
  createConnectState,
  createGooglePermissionState,
} from "../auth/oauth-state.util";
import { FOCUS_BEAR_OAUTH } from "../constants/focus-bear.constants";
import { FocusBearController } from "./focus-bear.controller";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VERIFIER = "pkce-verifier";
const FRONTEND_URL = "https://app.bearlymail.example";
const CONNECTED_URL = `${FRONTEND_URL}/settings?focusBear=connected#focus-bear`;
const FAILED_URL = `${FRONTEND_URL}/settings?focusBear=failed#focus-bear`;

describe("FocusBearController", () => {
  let focusBearService: { completeConnection: jest.Mock };
  let oauthClient: {
    isConfigured: jest.Mock;
    createPkcePair: jest.Mock;
    buildAuthorizeUrl: jest.Mock;
  };
  let controller: FocusBearController;
  let res: { cookie: jest.Mock; clearCookie: jest.Mock; redirect: jest.Mock };
  const previousEnv = { ...process.env };

  /** A connect state plus the cookies the browser that started it would send back. */
  const startConnect = (): { state: string; cookie: string } => {
    const cookies = new Map<string, string>();
    const state = createConnectState(USER_ID, {
      cookie: (name: string, value: string) => cookies.set(name, value),
    } as unknown as Response);
    return {
      state,
      cookie: `${CONNECT_BINDING_COOKIE}=${cookies.get(CONNECT_BINDING_COOKIE)}; ${FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE}=${VERIFIER}`,
    };
  };

  const callback = (cookie: string, code?: string, state?: string) =>
    controller.handleOAuthCallback(
      { headers: { cookie } } as Request,
      res as unknown as Response,
      code,
      state,
    );

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.FRONTEND_URL = FRONTEND_URL;
    focusBearService = {
      completeConnection: jest.fn().mockResolvedValue(undefined),
    };
    oauthClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      createPkcePair: jest
        .fn()
        .mockReturnValue({ verifier: VERIFIER, challenge: "challenge" }),
      buildAuthorizeUrl: jest
        .fn()
        .mockReturnValue("https://tenant.example/authorize?x=1"),
    };
    controller = new FocusBearController(
      focusBearService as unknown as FocusBearService,
      oauthClient as unknown as FocusBearOAuthClient,
    );
    res = { cookie: jest.fn(), clearCookie: jest.fn(), redirect: jest.fn() };
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  describe("connect-url", () => {
    it("returns the authorize URL and binds the flow to this browser with HttpOnly cookies", () => {
      const result = controller.getConnectUrl(
        { user: { userId: USER_ID } },
        res as unknown as Response,
      );

      expect(result).toEqual({ url: "https://tenant.example/authorize?x=1" });
      expect(res.cookie).toHaveBeenCalledWith(
        FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE,
        VERIFIER,
        expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        CONNECT_BINDING_COOKIE,
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const [state, challenge] = oauthClient.buildAuthorizeUrl.mock.calls[0];
      expect(state).toEqual(expect.any(String));
      expect(challenge).toBe("challenge");
    });

    it("says so when the server has no Focus Bear client configured", () => {
      oauthClient.isConfigured.mockReturnValue(false);

      expect(() =>
        controller.getConnectUrl(
          { user: { userId: USER_ID } },
          res as unknown as Response,
        ),
      ).toThrow(ServiceUnavailableException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("oauth/callback", () => {
    it("completes the connection for the user in the state and returns to settings", async () => {
      const { state, cookie } = startConnect();

      await callback(cookie, "auth-code", state);

      expect(focusBearService.completeConnection).toHaveBeenCalledWith(
        USER_ID,
        "auth-code",
        VERIFIER,
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE,
        { path: "/" },
      );
      expect(res.redirect).toHaveBeenCalledWith(CONNECTED_URL);
    });

    it("refuses a state another browser started", async () => {
      const { state } = startConnect();
      const otherBrowser = startConnect().cookie;

      await callback(otherBrowser, "auth-code", state);

      expect(focusBearService.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(FAILED_URL);
    });

    it.each([
      ["a tampered state", (state: string) => `${state}x`],
      ["no state", () => undefined],
      [
        "a state signed for a different flow",
        () => createGooglePermissionState(USER_ID, "calendar", "/settings"),
      ],
    ])("refuses %s", async (_name, makeState) => {
      const { state, cookie } = startConnect();

      await callback(cookie, "auth-code", makeState(state));

      expect(focusBearService.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(FAILED_URL);
    });

    it("reports a failure when the user declined, so no code came back", async () => {
      const { state, cookie } = startConnect();

      await callback(cookie, undefined, state);

      expect(focusBearService.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(FAILED_URL);
    });

    it("reports a failure without the PKCE verifier cookie", async () => {
      const { state, cookie } = startConnect();
      const withoutVerifier = cookie.split("; ")[0];

      await callback(withoutVerifier, "auth-code", state);

      expect(focusBearService.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(FAILED_URL);
    });

    it("reports a failure when Focus Bear refuses the code", async () => {
      focusBearService.completeConnection.mockRejectedValue(
        new Error("invalid_grant"),
      );
      const { state, cookie } = startConnect();

      await callback(cookie, "auth-code", state);

      expect(res.redirect).toHaveBeenCalledWith(FAILED_URL);
    });
  });
});
