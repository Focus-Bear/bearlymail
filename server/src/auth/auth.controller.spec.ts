import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Response } from "express";

import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { WaitlistService } from "../waitlist/waitlist.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

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

const expectedCookieOptions = expect.objectContaining({
  httpOnly: true,
  secure: false,
  sameSite: "strict",
  maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE_MS,
});

describe("AuthController", () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    setupPassword: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    setPasswordForSsoUser: jest.fn(),
    issueStepUpToken: jest.fn(),
    hasPassword: jest.fn(),
    setupMfa: jest.fn(),
    enableMfa: jest.fn(),
    verifyMfaAndElevate: jest.fn(),
    disableMfa: jest.fn(),
    getMfaStatus: jest.fn(),
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

  const mockWaitlistService = {};

  const mockBoss = {
    send: jest.fn().mockResolvedValue("job-id"),
  };

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
        { provide: WaitlistService, useValue: mockWaitlistService },
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should always reject with BadRequestException (registration disabled)", async () => {
      await expect(
        controller.register({ email: "new@example.com", password: "pw" }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.register({ email: "new@example.com", password: "pw" }),
      ).rejects.toThrow(/waitlist/i);
    });
  });

  describe("login", () => {
    const user = { id: "user-1", email: "user@example.com" };
    const loginData = { access_token: "jwt-token", user };

    it("should set the JWT cookie and return login data on success", async () => {
      mockAuthService.login.mockResolvedValue(loginData);
      const res = createMockResponse();

      const result = await controller.login({ user }, asResponse(res));

      expect(result).toEqual(loginData);
      expect(mockAuthService.login).toHaveBeenCalledWith(user);
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "jwt-token",
        expectedCookieOptions,
      );
    });

    it("should propagate UnauthorizedException and not set a cookie", async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException("Your account is pending approval."),
      );
      const res = createMockResponse();

      await expect(controller.login({ user }, asResponse(res))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("should clear the JWT cookie and return success", async () => {
      const res = createMockResponse();

      const result = await controller.logout(asResponse(res));

      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalledWith(AUTH_CONSTANTS.COOKIE_NAME);
    });
  });

  describe("setupPassword", () => {
    it("should delegate to the service, set the cookie, and return login data", async () => {
      const loginData = { access_token: "setup-jwt", user: { id: "user-1" } };
      mockAuthService.setupPassword.mockResolvedValue(loginData);
      const res = createMockResponse();

      const result = await controller.setupPassword(
        { token: "setup-token", password: "new-password-123" },
        asResponse(res),
      );

      expect(result).toEqual(loginData);
      expect(mockAuthService.setupPassword).toHaveBeenCalledWith(
        "setup-token",
        "new-password-123",
      );
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "setup-jwt",
        expectedCookieOptions,
      );
    });

    it("should propagate service errors for an invalid token", async () => {
      mockAuthService.setupPassword.mockRejectedValue(
        new BadRequestException("Invalid or expired token"),
      );
      const res = createMockResponse();

      await expect(
        controller.setupPassword(
          { token: "bad-token", password: "new-password-123" },
          asResponse(res),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("should call the service and return a non-revealing success message", async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword({
        email: "user@example.com",
      });

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
        "user@example.com",
      );
      expect(result).toEqual({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      });
    });

    it("should reject when email is missing without calling the service", async () => {
      await expect(controller.forgotPassword({ email: "" })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockAuthService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("should delegate, set the cookie, and return login data on success", async () => {
      const loginData = { access_token: "reset-jwt", user: { id: "user-1" } };
      mockAuthService.resetPassword.mockResolvedValue(loginData);
      const res = createMockResponse();

      const result = await controller.resetPassword(
        { token: "reset-token", password: "new-password-123" },
        asResponse(res),
      );

      expect(result).toEqual(loginData);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        "reset-token",
        "new-password-123",
      );
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "reset-jwt",
        expectedCookieOptions,
      );
    });

    it("should reject when token or password is missing without calling the service", async () => {
      const res = createMockResponse();

      await expect(
        controller.resetPassword(
          { token: "", password: "new-password-123" },
          asResponse(res),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.resetPassword(
          { token: "reset-token", password: "" },
          asResponse(res),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.resetPassword).not.toHaveBeenCalled();
    });

    it("should wrap invalid/expired token errors in BadRequestException with the service message", async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new Error("Invalid or expired password setup token"),
      );
      const res = createMockResponse();

      await expect(
        controller.resetPassword(
          { token: "expired-token", password: "new-password-123" },
          asResponse(res),
        ),
      ).rejects.toThrow(
        new BadRequestException("Invalid or expired password setup token"),
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("setPassword", () => {
    const req = { user: { userId: "user-1" } };
    const validPassword = "a-long-enough-password";

    it("should set the password using the authenticated user id, not body params", async () => {
      mockAuthService.setPasswordForSsoUser.mockResolvedValue(undefined);

      const result = await controller.setPassword(req, {
        password: validPassword,
        confirmPassword: validPassword,
      });

      expect(result).toEqual({
        success: true,
        message: "Password set successfully",
      });
      expect(mockAuthService.setPasswordForSsoUser).toHaveBeenCalledWith(
        "user-1",
        validPassword,
      );
    });

    it("should reject when password or confirmation is missing", async () => {
      await expect(
        controller.setPassword(req, {
          password: "",
          confirmPassword: validPassword,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.setPasswordForSsoUser).not.toHaveBeenCalled();
    });

    it("should reject when passwords do not match", async () => {
      const error: unknown = await controller
        .setPassword(req, {
          password: validPassword,
          confirmPassword: "different-password",
        })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        "Passwords do not match",
      );
      expect(mockAuthService.setPasswordForSsoUser).not.toHaveBeenCalled();
    });

    it("should reject passwords shorter than the minimum length", async () => {
      const short = "x".repeat(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH - 1);

      await expect(
        controller.setPassword(req, {
          password: short,
          confirmPassword: short,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.setPasswordForSsoUser).not.toHaveBeenCalled();
    });

    it("should wrap service errors in BadRequestException", async () => {
      mockAuthService.setPasswordForSsoUser.mockRejectedValue(
        new Error("User not found"),
      );

      await expect(
        controller.setPassword(req, {
          password: validPassword,
          confirmPassword: validPassword,
        }),
      ).rejects.toThrow(new BadRequestException("User not found"));
    });
  });

  describe("issueStepUpToken", () => {
    it("should issue a step-up token scoped to the authenticated user", async () => {
      mockAuthService.issueStepUpToken.mockResolvedValue("step-up-jwt");

      const result = await controller.issueStepUpToken(
        { user: { userId: "user-1" } },
        { password: "current-password" },
      );

      expect(result).toEqual({ step_up_token: "step-up-jwt" });
      expect(mockAuthService.issueStepUpToken).toHaveBeenCalledWith(
        "user-1",
        "current-password",
      );
    });

    it("should propagate UnauthorizedException for an incorrect password", async () => {
      mockAuthService.issueStepUpToken.mockRejectedValue(
        new UnauthorizedException("Incorrect password"),
      );

      await expect(
        controller.issueStepUpToken(
          { user: { userId: "user-1" } },
          { password: "wrong" },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("hasPassword", () => {
    it("should return the has-password flag for the authenticated user", async () => {
      mockAuthService.hasPassword.mockResolvedValue(true);

      const result = await controller.hasPassword({
        user: { userId: "user-1" },
      });

      expect(result).toEqual({ hasPassword: true });
      expect(mockAuthService.hasPassword).toHaveBeenCalledWith("user-1");
    });
  });

  describe("mfaSetup", () => {
    it("should return the TOTP secret and QR code for the authenticated user", async () => {
      const setupData = {
        secret: "totp-secret",
        qrCodeDataUrl: "data:image/png;base64,abc",
      };
      mockAuthService.setupMfa.mockResolvedValue(setupData);

      const result = await controller.mfaSetup({ user: { userId: "user-1" } });

      expect(result).toEqual(setupData);
      expect(mockAuthService.setupMfa).toHaveBeenCalledWith("user-1");
    });

    it("should wrap service errors in BadRequestException", async () => {
      mockAuthService.setupMfa.mockRejectedValue(
        new Error("MFA already enabled"),
      );

      await expect(
        controller.mfaSetup({ user: { userId: "user-1" } }),
      ).rejects.toThrow(new BadRequestException("MFA already enabled"));
    });
  });

  describe("mfaEnable", () => {
    it("should enable MFA for the authenticated user with a valid code", async () => {
      mockAuthService.enableMfa.mockResolvedValue(true);

      const result = await controller.mfaEnable(
        { user: { userId: "user-1" } },
        { token: "123456" },
      );

      expect(result).toEqual({
        success: true,
        message: "MFA enabled successfully",
      });
      expect(mockAuthService.enableMfa).toHaveBeenCalledWith(
        "user-1",
        "123456",
      );
    });

    it("should reject an invalid TOTP code with BadRequestException", async () => {
      mockAuthService.enableMfa.mockResolvedValue(false);

      const error: unknown = await controller
        .mfaEnable({ user: { userId: "user-1" } }, { token: "000000" })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        "Invalid TOTP code. Please try again.",
      );
    });

    it("should reject when the token is missing without calling the service", async () => {
      await expect(
        controller.mfaEnable({ user: { userId: "user-1" } }, { token: "" }),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.enableMfa).not.toHaveBeenCalled();
    });
  });

  describe("mfaVerify", () => {
    it("should set the elevated JWT cookie and return the result on a valid code", async () => {
      const elevated = { access_token: "elevated-jwt" };
      mockAuthService.verifyMfaAndElevate.mockResolvedValue(elevated);
      const res = createMockResponse();

      const result = await controller.mfaVerify(
        { user: { userId: "user-1", email: "user@example.com" } },
        { token: "123456" },
        asResponse(res),
      );

      expect(result).toEqual(elevated);
      expect(mockAuthService.verifyMfaAndElevate).toHaveBeenCalledWith(
        "user-1",
        "user@example.com",
        "123456",
      );
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_CONSTANTS.COOKIE_NAME,
        "elevated-jwt",
        expectedCookieOptions,
      );
    });

    it("should throw UnauthorizedException on an invalid code and not set a cookie", async () => {
      mockAuthService.verifyMfaAndElevate.mockResolvedValue(null);
      const res = createMockResponse();

      await expect(
        controller.mfaVerify(
          { user: { userId: "user-1", email: "user@example.com" } },
          { token: "000000" },
          asResponse(res),
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it("should reject when the token is missing without calling the service", async () => {
      const res = createMockResponse();

      await expect(
        controller.mfaVerify(
          { user: { userId: "user-1", email: "user@example.com" } },
          { token: "" },
          asResponse(res),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.verifyMfaAndElevate).not.toHaveBeenCalled();
    });
  });

  describe("mfaDisable", () => {
    it("should disable MFA for the authenticated user with a valid code", async () => {
      mockAuthService.disableMfa.mockResolvedValue(true);

      const result = await controller.mfaDisable(
        { user: { userId: "user-1" } },
        { token: "123456" },
      );

      expect(result).toEqual({
        success: true,
        message: "MFA disabled successfully",
      });
      expect(mockAuthService.disableMfa).toHaveBeenCalledWith(
        "user-1",
        "123456",
      );
    });

    it("should reject an invalid TOTP code with BadRequestException", async () => {
      mockAuthService.disableMfa.mockResolvedValue(false);

      const error: unknown = await controller
        .mfaDisable({ user: { userId: "user-1" } }, { token: "000000" })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        "Invalid TOTP code. Please try again.",
      );
    });

    it("should reject when the token is missing without calling the service", async () => {
      await expect(
        controller.mfaDisable({ user: { userId: "user-1" } }, { token: "" }),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuthService.disableMfa).not.toHaveBeenCalled();
    });
  });

  describe("mfaStatus", () => {
    it("should report verified=true for a fresh MFA elevation", async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      const result = await controller.mfaStatus({
        user: {
          userId: "user-1",
          mfaVerified: true,
          mfaVerifiedAt: Date.now(),
        },
      });

      expect(result).toEqual({ enabled: true, verified: true });
      expect(mockAuthService.getMfaStatus).toHaveBeenCalledWith("user-1");
    });

    it("should report verified=false for a stale elevation", async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });
      const staleTimestamp =
        Date.now() - AUTH_CONSTANTS.MFA_ELEVATION_TTL_MS - 1000;

      const result = await controller.mfaStatus({
        user: {
          userId: "user-1",
          mfaVerified: true,
          mfaVerifiedAt: staleTimestamp,
        },
      });

      expect(result).toEqual({ enabled: true, verified: false });
    });

    it("should report verified=false when the session was never elevated", async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: false });

      const result = await controller.mfaStatus({
        user: { userId: "user-1" },
      });

      expect(result).toEqual({ enabled: false, verified: false });
    });
  });
});
