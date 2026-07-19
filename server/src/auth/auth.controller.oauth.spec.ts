import { Test, TestingModule } from "@nestjs/testing";
import { createHmac } from "crypto";
import { Response } from "express";

import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { WaitlistService } from "../waitlist/waitlist.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

const FRONTEND_URL = "https://app.bearlymail.test";

interface MockResponse {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
  redirect: jest.Mock;
}

function createMockResponse(): MockResponse {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
}

function asResponse(mock: MockResponse): Response {
  return mock as unknown as Response;
}

// Mirrors the HMAC signing in oauth-state.util.ts so the controller's
// signature verification accepts the state these tests produce.
function encodeState(payload: Record<string, string>): string {
  const json = JSON.stringify({ ...payload, iat: Date.now() });
  const body = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", process.env.JWT_SECRET as string)
    .update(json)
    .digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Fully asserts the JWT cookie options (mirrors the helper in
 * auth.controller.spec.ts) so security-relevant flags are always verified.
 */
const expectedCookieOptions = expect.objectContaining({
  httpOnly: true,
  secure: false,
  sameSite: "strict",
  maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE_MS,
});

function expectedErrorRedirect(message: string, type: string): string {
  const params = new URLSearchParams({
    error: "auth_failed",
    message,
    type,
  });
  return `${FRONTEND_URL}/auth-error?${params.toString()}`;
}

describe("AuthController OAuth callbacks", () => {
  let controller: AuthController;
  let originalFrontendUrl: string | undefined;

  const loginData = { access_token: "oauth-jwt", user: { id: "user-1" } };

  const mockAuthService = {
    login: jest.fn(),
  };

  const mockGoogleAccountsService = {
    findAllByUser: jest.fn(),
    updateTokens: jest.fn(),
    create: jest.fn(),
  };

  const mockOffice365AccountsService = {
    findAllByUser: jest.fn(),
    updateTokens: jest.fn(),
    create: jest.fn(),
  };

  const mockZohoAccountsService = {
    findAllByUser: jest.fn(),
    updateTokens: jest.fn(),
    create: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
  };

  beforeAll(() => {
    originalFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = FRONTEND_URL;
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: GoogleAccountsService, useValue: mockGoogleAccountsService },
        {
          provide: Office365AccountsService,
          useValue: mockOffice365AccountsService,
        },
        { provide: ZohoAccountsService, useValue: mockZohoAccountsService },
        { provide: WaitlistService, useValue: {} },
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    mockAuthService.login.mockResolvedValue(loginData);
    mockBoss.send.mockResolvedValue("job-id");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("googleAuthRedirect", () => {
    const googleUser = { id: "user-1", email: "user@example.com" };

    it("should log in, set the JWT cookie, and redirect to the inbox on success", async () => {
      const res = createMockResponse();

      await controller.googleAuthRedirect(
        { user: googleUser },
        asResponse(res),
        undefined,
      );

      expect(mockAuthService.login).toHaveBeenCalledWith(googleUser);
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "oauth-jwt",
        expectedCookieOptions,
      );
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/inbox`);
    });

    it("should redirect to the auth-error page when the guard reports an error", async () => {
      const res = createMockResponse();

      await controller.googleAuthRedirect(
        {
          authError: new Error("Your account is pending approval."),
          user: { authFailed: true },
        },
        asResponse(res),
        undefined,
      );

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expectedErrorRedirect(
          "Your account is pending approval.",
          "pending_approval",
        ),
      );
    });

    it("should use a generic message and auth_error type when auth failed without an error object", async () => {
      const res = createMockResponse();

      await controller.googleAuthRedirect(
        { user: { authFailed: true } },
        asResponse(res),
        undefined,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expectedErrorRedirect("Authentication failed", "auth_error"),
      );
    });

    it("should link a new Google account to the state userId in the connect flow", async () => {
      const res = createMockResponse();
      mockGoogleAccountsService.findAllByUser.mockResolvedValue([]);
      const connectUser = {
        googleId: "google-123",
        googleAccessToken: "access-token",
        googleRefreshToken: "refresh-token",
        email: "linked@example.com",
        name: "Linked User",
      };

      await controller.googleAuthRedirect(
        { user: connectUser },
        asResponse(res),
        encodeState({ action: "connect", userId: "owner-1" }),
      );

      expect(mockGoogleAccountsService.findAllByUser).toHaveBeenCalledWith(
        "owner-1",
      );
      expect(mockGoogleAccountsService.create).toHaveBeenCalledWith({
        userId: "owner-1",
        googleId: "google-123",
        email: "linked@example.com",
        name: "Linked User",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        isPrimary: true,
      });
      expect(mockBoss.send).toHaveBeenCalledWith(
        JOB_NAMES.SYNC_CONTACTS,
        { userId: "owner-1" },
        expect.objectContaining({ singletonKey: "sync-contacts-owner-1" }),
      );
      expect(mockBoss.send).toHaveBeenCalledWith(
        JOB_NAMES.FETCH_USER_EMAILS,
        { userId: "owner-1" },
        expect.objectContaining({
          singletonKey: "fetch-user-emails-owner-1",
        }),
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/settings?googleConnected=true`,
      );
    });

    it("should update tokens instead of creating when the Google account already exists", async () => {
      const res = createMockResponse();
      mockGoogleAccountsService.findAllByUser.mockResolvedValue([
        { id: "account-1", googleId: "google-123" },
      ]);

      await controller.googleAuthRedirect(
        {
          user: {
            googleId: "google-123",
            googleAccessToken: "new-access",
            googleRefreshToken: "new-refresh",
            email: "linked@example.com",
          },
        },
        asResponse(res),
        encodeState({ action: "connect", userId: "owner-1" }),
      );

      expect(mockGoogleAccountsService.updateTokens).toHaveBeenCalledWith(
        "account-1",
        "owner-1",
        "new-access",
        "new-refresh",
      );
      expect(mockGoogleAccountsService.create).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/settings?googleConnected=true`,
      );
    });

    it("should fall through to the normal login flow when state is not a connect action", async () => {
      const res = createMockResponse();

      await controller.googleAuthRedirect(
        { user: googleUser },
        asResponse(res),
        encodeState({ action: "disconnect", userId: "owner-1" }),
      );

      expect(mockGoogleAccountsService.findAllByUser).not.toHaveBeenCalled();
      expect(mockAuthService.login).toHaveBeenCalledWith(googleUser);
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/inbox`);
    });
  });

  describe("microsoftAuthRedirect", () => {
    const microsoftUser = {
      id: "user-1",
      microsoftId: "ms-123",
      microsoftAccessToken: "ms-access",
      microsoftRefreshToken: "ms-refresh",
      microsoftProfile: {
        id: "ms-123",
        mail: "user@outlook.com",
        displayName: "MS User",
      },
    };

    it("should log in, save the Office365 account, set the cookie, and redirect to the inbox", async () => {
      const res = createMockResponse();
      mockOffice365AccountsService.findAllByUser.mockResolvedValue([]);

      await controller.microsoftAuthRedirect(
        { user: microsoftUser },
        asResponse(res),
        undefined,
      );

      expect(mockAuthService.login).toHaveBeenCalledWith(microsoftUser);
      expect(mockOffice365AccountsService.findAllByUser).toHaveBeenCalledWith(
        "user-1",
      );
      expect(mockOffice365AccountsService.create).toHaveBeenCalledWith({
        userId: "user-1",
        microsoftId: "ms-123",
        email: "user@outlook.com",
        name: "MS User",
        accessToken: "ms-access",
        refreshToken: "ms-refresh",
        isPrimary: true,
      });
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "oauth-jwt",
        expectedCookieOptions,
      );
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/inbox`);
    });

    it("should redirect to the auth-error page when the guard reports an error", async () => {
      const res = createMockResponse();

      await controller.microsoftAuthRedirect(
        {
          authError: new Error("Please join the waitlist first."),
          user: { authFailed: true },
        },
        asResponse(res),
        undefined,
      );

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expectedErrorRedirect(
          "Please join the waitlist first.",
          "not_on_waitlist",
        ),
      );
    });

    it("should update tokens for an existing account in the connect flow using the state userId", async () => {
      const res = createMockResponse();
      mockOffice365AccountsService.findAllByUser.mockResolvedValue([
        { id: "account-1", microsoftId: "ms-123" },
      ]);

      await controller.microsoftAuthRedirect(
        { user: microsoftUser },
        asResponse(res),
        encodeState({ action: "connect", userId: "owner-1" }),
      );

      expect(mockOffice365AccountsService.findAllByUser).toHaveBeenCalledWith(
        "owner-1",
      );
      expect(mockOffice365AccountsService.updateTokens).toHaveBeenCalledWith(
        "account-1",
        "owner-1",
        "ms-access",
        "ms-refresh",
      );
      expect(mockBoss.send).toHaveBeenCalledWith(
        JOB_NAMES.FETCH_USER_EMAILS,
        { userId: "owner-1" },
        expect.objectContaining({
          singletonKey: "fetch-user-emails-owner-1",
        }),
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/settings?office365Connected=true`,
      );
    });
  });

  describe("zohoAuthRedirect", () => {
    const zohoUser = {
      id: "user-1",
      zohoId: "zoho-123",
      zohoAccessToken: "zoho-access",
      zohoRefreshToken: "zoho-refresh",
      accountsServer: "https://accounts.zoho.com",
      zohoProfile: {
        Zuid: "zoho-123",
        Email: "user@zoho.com",
        Display_Name: "Zoho User",
      },
    };

    it("should save a new Zoho account, log in, set the cookie, and redirect to the inbox", async () => {
      const res = createMockResponse();
      mockZohoAccountsService.findAllByUser.mockResolvedValue([]);

      await controller.zohoAuthRedirect(
        { user: zohoUser },
        asResponse(res),
        undefined,
      );

      expect(mockZohoAccountsService.findAllByUser).toHaveBeenCalledWith(
        "user-1",
      );
      expect(mockZohoAccountsService.create).toHaveBeenCalledWith({
        userId: "user-1",
        zohoId: "zoho-123",
        email: "user@zoho.com",
        name: "Zoho User",
        accessToken: "zoho-access",
        refreshToken: "zoho-refresh",
        accountsServer: "https://accounts.zoho.com",
        isPrimary: true,
      });
      expect(mockAuthService.login).toHaveBeenCalledWith(zohoUser);
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "oauth-jwt",
        expectedCookieOptions,
      );
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/inbox`);
    });

    it("should update tokens instead of creating when the Zoho account already exists", async () => {
      const res = createMockResponse();
      mockZohoAccountsService.findAllByUser.mockResolvedValue([
        { id: "account-1", zohoId: "zoho-123" },
      ]);

      await controller.zohoAuthRedirect(
        { user: zohoUser },
        asResponse(res),
        undefined,
      );

      expect(mockZohoAccountsService.updateTokens).toHaveBeenCalledWith(
        "account-1",
        "user-1",
        "zoho-access",
        "zoho-refresh",
        "https://accounts.zoho.com",
      );
      expect(mockZohoAccountsService.create).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND_URL}/inbox`);
    });

    it("should redirect to the auth-error page listing missing profile fields", async () => {
      const res = createMockResponse();

      await controller.zohoAuthRedirect(
        {
          user: {
            id: "user-1",
            zohoId: "zoho-123",
            zohoProfile: { Zuid: "zoho-123", Email: "user@zoho.com" },
          },
        },
        asResponse(res),
        undefined,
      );

      expect(mockZohoAccountsService.create).not.toHaveBeenCalled();
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expectedErrorRedirect(
          "Incomplete Zoho profile received. Missing: accessToken, accountsServer",
          "auth_error",
        ),
      );
    });

    it("should redirect to the auth-error page when the guard reports an error", async () => {
      const res = createMockResponse();

      await controller.zohoAuthRedirect(
        {
          authError: new Error("Zoho authentication failed"),
          user: { authFailed: true },
        },
        asResponse(res),
        undefined,
      );

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expectedErrorRedirect("Zoho authentication failed", "auth_error"),
      );
    });

    it("should link the Zoho account to the state userId in the connect flow", async () => {
      const res = createMockResponse();
      mockZohoAccountsService.findAllByUser.mockResolvedValue([]);
      const connectUser = {
        zohoId: "zoho-123",
        zohoAccessToken: "zoho-access",
        zohoRefreshToken: "zoho-refresh",
        accountsServer: "https://accounts.zoho.com",
        zohoProfile: {
          ZUID: "zoho-123",
          Email: "user@zoho.com",
          Display_Name: "Zoho User",
        },
      };

      await controller.zohoAuthRedirect(
        { user: connectUser },
        asResponse(res),
        encodeState({ action: "connect", userId: "owner-1" }),
      );

      expect(mockZohoAccountsService.findAllByUser).toHaveBeenCalledWith(
        "owner-1",
      );
      expect(mockZohoAccountsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-1",
          zohoId: "zoho-123",
          isPrimary: true,
        }),
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/settings?zohoConnected=true`,
      );
    });
  });
});
