import { createHmac } from "crypto";
import { Response } from "express";

import { AUTH_ACTION_TYPES } from "../constants/domain-types";
import { AuthController } from "./auth.controller";

/**
 * Covers the two OAuth bugs found while writing the controller's main spec:
 * 1. A connect-flow persistence failure used to fall through to login —
 *    silently logging the user in (possibly switching sessions) instead of
 *    surfacing the connect error. It must now redirect to /auth-error and
 *    NOT set a login cookie.
 * 2. The Zoho login path read `zohoProfile.Zuid`, but the strategy emits
 *    `ZUID` (uppercase) — the fallback could never fire.
 */
describe("AuthController OAuth connect-flow error handling", () => {
  const makeRes = () => {
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    return res as unknown as Response & {
      cookie: jest.Mock;
      redirect: jest.Mock;
    };
  };

  // Signed to match oauth-state.util.ts, which the controller now verifies.
  const connectState = (userId: string) => {
    const json = JSON.stringify({
      action: AUTH_ACTION_TYPES.CONNECT,
      userId,
      iat: Date.now(),
    });
    const body = Buffer.from(json).toString("base64url");
    const sig = createHmac("sha256", process.env.JWT_SECRET as string)
      .update(json)
      .digest("base64url");
    return `${body}.${sig}`;
  };

  const makeController = (overrides?: {
    googleAccountsService?: Record<string, jest.Mock>;
    zohoAccountsService?: Record<string, jest.Mock>;
  }) => {
    const authService = { login: jest.fn() };
    const googleAccountsService = overrides?.googleAccountsService ?? {
      findAllByUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateTokens: jest.fn(),
    };
    const office365AccountsService = {
      findAllByUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateTokens: jest.fn(),
    };
    const zohoAccountsService = overrides?.zohoAccountsService ?? {
      findAllByUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateTokens: jest.fn(),
    };
    const boss = { send: jest.fn().mockResolvedValue("job-1") };
    const controller = new AuthController(
      authService as never,
      googleAccountsService as never,
      office365AccountsService as never,
      zohoAccountsService as never,
      boss as never,
    );
    return { controller, authService, zohoAccountsService };
  };

  const originalFrontendUrl = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = "https://app.test";
  });
  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("redirects a failed Google connect to /auth-error instead of logging in", async () => {
    const { controller, authService } = makeController({
      googleAccountsService: {
        findAllByUser: jest.fn().mockRejectedValue(new Error("db down")),
        create: jest.fn(),
        updateTokens: jest.fn(),
      },
    });
    const res = makeRes();
    const req = {
      user: {
        googleId: "g-1",
        googleAccessToken: "at",
        googleRefreshToken: "rt",
        email: "user@example.com",
      },
    };

    await controller.googleAuthRedirect(
      req as never,
      res,
      connectState("user-1"),
    );

    // The user asked to CONNECT — a persistence failure must surface, not
    // silently log them in.
    expect(authService.login).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledTimes(1);
    const redirectUrl = res.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain("/auth-error?");
    expect(redirectUrl).toContain("Failed+to+connect+your+Google+account");
  });

  it("redirects a Google connect with missing fields to /auth-error instead of logging in", async () => {
    const { controller, authService } = makeController();
    const res = makeRes();
    // Confirmed CONNECT intent (valid state) but the profile is missing the
    // access/refresh tokens — must surface, not fall through to login.
    const req = {
      user: {
        googleId: "g-1",
        email: "user@example.com",
        // no googleAccessToken / googleRefreshToken
      },
    };

    await controller.googleAuthRedirect(
      req as never,
      res,
      connectState("user-1"),
    );

    expect(authService.login).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    const redirectUrl = res.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain("/auth-error?");
    expect(redirectUrl).toContain("Failed+to+connect+your+Google+account");
  });

  it("accepts the strategy's uppercase ZUID on the Zoho login path", async () => {
    const { controller, authService, zohoAccountsService } = makeController();
    authService.login.mockResolvedValue({ access_token: "jwt-1" });
    const res = makeRes();
    const req = {
      user: {
        id: "user-1",
        // Strategy emits ZUID (uppercase); no lowercase Zuid, no zohoId.
        zohoProfile: { ZUID: "z-123", Email: "user@example.com" },
        zohoAccessToken: "at",
        zohoRefreshToken: "rt",
        accountsServer: "https://accounts.zoho.com",
      },
    };

    await controller.zohoAuthRedirect(req as never, res, undefined);

    // Previously zohoId resolved to undefined (only lowercase Zuid was read),
    // which hit the missing-fields error redirect instead of creating the
    // account and logging in.
    expect(zohoAccountsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ zohoId: "z-123", userId: "user-1" }),
    );
    expect(res.cookie).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("https://app.test/inbox");
  });
});
