import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import type { PgBoss } from "pg-boss";

import {
  DeletedAccount,
  DeletionReason,
} from "../database/entities/deleted-account.entity";
import { User } from "../database/entities/user.entity";
import { EmailBacklogService } from "../emails/email-backlog.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { UsersService } from "../users/users.service";
import { AuthService, verifiedMicrosoftSignInEmail } from "./auth.service";
import { EmailVerificationService } from "./email-verification.service";
import { EmailNotVerifiedException } from "./exceptions/email-not-verified.exception";
import {
  AccountLockedException,
  LoginLockoutService,
} from "./login-lockout.service";
import { hashEmailedToken } from "./token-hash.util";
import { TotpService } from "./totp.service";

jest.mock("bcrypt");
jest.mock("./auth-logger", () => ({
  writeDebugLog: jest.fn(),
  AuthLogger: jest.fn().mockImplementation(() => ({
    logAuthFailure: jest.fn(),
  })),
}));

describe("AuthService", () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let boss: jest.Mocked<PgBoss>;
  let emailBacklogService: jest.Mocked<EmailBacklogService>;
  let totpService: jest.Mocked<TotpService>;
  let captureEvent: jest.Mock;
  let ensurePersonalOrg: jest.Mock;
  let emailVerification: {
    claimForProviderSignIn: jest.Mock;
    assertVerifiedForPasswordSignIn: jest.Mock;
    sendVerification: jest.Mock;
    sendPasswordResetLink: jest.Mock;
  };
  let loginLockout: {
    assertNotLocked: jest.Mock;
    recordFailure: jest.Mock;
    recordSuccess: jest.Mock;
    recordUnknownEmailAttempt: jest.Mock;
  };

  const mockUser: User = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    password: "hashed-password",
    isApproved: true,
    isAdmin: false,
    needsRelogin: false,
    hasSeenTour: false,
    hasScannedHistory: false,
    termsAcceptedAt: null,
    privacyAcceptedAt: null,
    termsVersion: null,
    privacyVersion: null,
    googleId: null,
    googleCalendarAccessToken: null,
    googleCalendarRefreshToken: null,
    passwordSetupTokenHash: null,
    passwordSetupTokenExpiresAt: null,
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    loginLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    const mockUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findByPasswordSetupTokenHash: jest.fn(),
      wasUserInactive: jest.fn().mockResolvedValue(false),
      updateLastActivity: jest.fn().mockResolvedValue(undefined),
      hashEmail: jest.fn().mockReturnValue("hashed-email"),
      findDeletedAccountByEmailHash: jest.fn().mockResolvedValue(null),
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    const mockBoss = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const mockEmailBacklogService = {
      queueBacklogProcessing: jest.fn().mockResolvedValue({ threadCount: 0 }),
    };

    const mockTotpService = {
      setupMfa: jest.fn(),
      enableMfa: jest.fn(),
      verifyMfa: jest.fn(),
      disableMfa: jest.fn(),
      getMfaStatus: jest.fn(),
    };

    captureEvent = jest.fn();

    ensurePersonalOrg = jest.fn().mockResolvedValue({ id: "org-1" });
    const mockOrganizationsService = { ensurePersonalOrg };

    emailVerification = {
      claimForProviderSignIn: jest.fn(async (user: User) => user),
      assertVerifiedForPasswordSignIn: jest.fn().mockResolvedValue(undefined),
      sendVerification: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetLink: jest.fn().mockResolvedValue(undefined),
    };
    loginLockout = {
      assertNotLocked: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordUnknownEmailAttempt: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
        {
          provide: EmailBacklogService,
          useValue: mockEmailBacklogService,
        },
        {
          provide: TotpService,
          useValue: mockTotpService,
        },
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
        { provide: ErrorTrackingService, useValue: { captureEvent } },
        { provide: EmailVerificationService, useValue: emailVerification },
        { provide: LoginLockoutService, useValue: loginLockout },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    boss = module.get("PG_BOSS");
    emailBacklogService = module.get(EmailBacklogService);
    totpService = module.get(TotpService);

    // Mock bcrypt.compare
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("validateUser", () => {
    it("should return user without password when credentials are valid", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser("test@example.com", "password");

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockUser.id);
      expect(result).not.toHaveProperty("password");
      expect(usersService.findByEmail).toHaveBeenCalledWith("test@example.com");
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password",
        "hashed-password",
      );
    });

    it("should provision a personal org on a successful password login", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateUser("test@example.com", "password");

      expect(ensurePersonalOrg).toHaveBeenCalledWith(mockUser.id);
    });

    it("should not provision an org when the password is wrong", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await service.validateUser("test@example.com", "wrong");

      expect(ensurePersonalOrg).not.toHaveBeenCalled();
    });

    it("should return null when user is not found and no deleted account record", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findDeletedAccountByEmailHash.mockResolvedValue(null);

      const result = await service.validateUser("test@example.com", "password");

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should return null when user is not found and deleted account has no passwordHash", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findDeletedAccountByEmailHash.mockResolvedValue({
        id: "del-1",
        emailHash: "hashed-email",
        passwordHash: null,
        deletionReason: DeletionReason.INACTIVITY,
        deletedAt: new Date(),
      } as DeletedAccount);

      const result = await service.validateUser("test@example.com", "password");

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should throw DeletedAccountException when deleted account found and password matches (inactivity)", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findDeletedAccountByEmailHash.mockResolvedValue({
        id: "del-1",
        emailHash: "hashed-email",
        passwordHash: "stored-bcrypt-hash",
        deletionReason: DeletionReason.INACTIVITY,
        deletedAt: new Date(),
      } as DeletedAccount);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.validateUser("test@example.com", "password"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: "ACCOUNT_DELETED",
          deletionReason: "inactivity",
        }),
      });
    });

    it("should throw DeletedAccountException when deleted account found and password matches (manual)", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findDeletedAccountByEmailHash.mockResolvedValue({
        id: "del-1",
        emailHash: "hashed-email",
        passwordHash: "stored-bcrypt-hash",
        deletionReason: DeletionReason.MANUAL,
        deletedAt: new Date(),
      } as DeletedAccount);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.validateUser("test@example.com", "password"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: "ACCOUNT_DELETED",
          deletionReason: "manual",
        }),
      });
    });

    it("should return null (not reveal deletion) when deleted account found but password does not match", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findDeletedAccountByEmailHash.mockResolvedValue({
        id: "del-1",
        emailHash: "hashed-email",
        passwordHash: "stored-bcrypt-hash",
        deletionReason: DeletionReason.MANUAL,
        deletedAt: new Date(),
      } as DeletedAccount);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(
        "test@example.com",
        "wrong-password",
      );

      expect(result).toBeNull();
    });

    it("should return null when password is incorrect", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(
        "test@example.com",
        "wrong-password",
      );

      expect(result).toBeNull();
    });

    it("should admit an unapproved user now that the waitlist gate is removed", async () => {
      const unapprovedUser = { ...mockUser, isApproved: false };
      usersService.findByEmail.mockResolvedValue(unapprovedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser("test@example.com", "password");

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty("password");
    });

    it("should throw OAuthOnlyAccountException when user has null password", async () => {
      const userWithNullPassword = { ...mockUser, password: null };
      usersService.findByEmail.mockResolvedValue(userWithNullPassword as User);

      await expect(
        service.validateUser("test@example.com", "password"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: "OAUTH_ONLY_ACCOUNT" }),
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should throw OAuthOnlyAccountException when user has empty string password (OAuth-only account)", async () => {
      const oauthOnlyUser = { ...mockUser, password: "" };
      usersService.findByEmail.mockResolvedValue(oauthOnlyUser as User);

      await expect(
        service.validateUser("test@example.com", "any-password"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: "OAUTH_ONLY_ACCOUNT" }),
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe("validateGoogleUser", () => {
    const mockProfile = {
      id: "google-id-123",
      emails: [{ value: "test@example.com", verified: true }],
      displayName: "Test User",
    };

    it("should create new user when user does not exist", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.validateGoogleUser(
        mockProfile,
        "access-token",
        "refresh-token",
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          googleId: "google-id-123",
          googleCalendarAccessToken: "access-token",
          googleCalendarRefreshToken: "refresh-token",
          isApproved: true,
          isAdmin: false,
        }),
      );
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty("password");
    });

    it("should auto-approve and make admin for jeremy@focusbear.io", async () => {
      const jeremyProfile = {
        ...mockProfile,
        emails: [{ value: "jeremy@focusbear.io", verified: true }],
      };
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        ...mockUser,
        email: "jeremy@focusbear.io",
        isApproved: true,
        isAdmin: true,
      });

      await service.validateGoogleUser(
        jeremyProfile,
        "access-token",
        "refresh-token",
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "jeremy@focusbear.io",
          isApproved: true,
          isAdmin: true,
        }),
      );
    });

    it("should throw error when refresh token is missing for new user", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateGoogleUser(mockProfile, "access-token", ""),
      ).rejects.toThrow("Google OAuth did not provide a refresh token");
    });

    it("should update existing user with new tokens", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      const result = await service.validateGoogleUser(
        mockProfile,
        "new-access-token",
        "new-refresh-token",
      );

      expect(usersService.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          googleId: "google-id-123",
          googleCalendarAccessToken: "new-access-token",
          googleCalendarRefreshToken: "new-refresh-token",
          needsRelogin: false,
        }),
      );
      expect(result).toBeDefined();
    });

    it("records the granted scopes and clears a stale Gmail access issue on a fresh grant", async () => {
      const grantedScopes = "email profile gmail-scopes";
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      await service.validateGoogleUser(
        mockProfile,
        "access-token",
        "refresh-token",
        grantedScopes,
      );

      expect(usersService.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          googleGrantedScopes: grantedScopes,
          gmailAccessIssue: null,
          gmailAccessIssueAt: null,
        }),
      );
    });

    it("records the granted scopes on a new Google account", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);

      await service.validateGoogleUser(
        mockProfile,
        "access-token",
        "refresh-token",
        "email profile",
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ googleGrantedScopes: "email profile" }),
      );
    });

    it("keeps the known grant and Gmail access issue when Google sends neither scopes nor a refresh token", async () => {
      const userWithToken = {
        ...mockUser,
        googleCalendarRefreshToken: "existing-refresh-token",
      };
      usersService.findByEmail.mockResolvedValue(userWithToken);
      usersService.update.mockResolvedValue(userWithToken);
      usersService.findOne.mockResolvedValue(userWithToken);

      await service.validateGoogleUser(mockProfile, "access-token", "");

      const updates = usersService.update.mock.calls[0][1];
      expect(updates).not.toHaveProperty("googleGrantedScopes");
      expect(updates).not.toHaveProperty("gmailAccessIssue");
    });

    it("should preserve existing refresh token when new one is not provided", async () => {
      const userWithToken = {
        ...mockUser,
        googleCalendarRefreshToken: "existing-refresh-token",
      };
      usersService.findByEmail.mockResolvedValue(userWithToken);
      usersService.update.mockResolvedValue(userWithToken);
      usersService.findOne.mockResolvedValue(userWithToken);

      await service.validateGoogleUser(mockProfile, "access-token", "");

      expect(usersService.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.not.objectContaining({
          googleCalendarRefreshToken: expect.anything(),
        }),
      );
    });

    it("should set needsRelogin when refresh token is missing for existing user", async () => {
      const userWithoutToken = {
        ...mockUser,
        googleCalendarRefreshToken: null,
      };
      usersService.findByEmail.mockResolvedValue(userWithoutToken);
      usersService.update.mockResolvedValue(userWithoutToken);
      usersService.findOne.mockResolvedValue(userWithoutToken);

      await service.validateGoogleUser(mockProfile, "access-token", "");

      expect(usersService.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          needsRelogin: true,
        }),
      );
    });

    it("should auto-approve a legacy unapproved user on login (no waitlist gate)", async () => {
      const unapprovedUser = { ...mockUser, isApproved: false };
      const approvedUser = { ...mockUser, isApproved: true };
      usersService.findByEmail.mockResolvedValue(unapprovedUser);
      usersService.update.mockResolvedValue(approvedUser);
      // ensureApproved re-fetches the freshly-approved user
      usersService.findOne
        .mockResolvedValueOnce(unapprovedUser)
        .mockResolvedValue(approvedUser);

      const result = await service.validateGoogleUser(
        mockProfile,
        "access-token",
        "refresh-token",
      );

      expect(usersService.update).toHaveBeenCalledWith(unapprovedUser.id, {
        isApproved: true,
      });
      expect(result).toBeDefined();
    });

    it("should trigger email sync job after successful login", async () => {
      jest.useFakeTimers();
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      const validatePromise = service.validateGoogleUser(
        mockProfile,
        "access-token",
        "refresh-token",
      );

      await validatePromise;

      // Fast-forward time to trigger setTimeout after the promise resolves
      jest.advanceTimersByTime(2000);

      // Allow any pending promises to resolve
      await Promise.resolve();

      expect(boss.send).toHaveBeenCalledWith(
        "fetch-user-emails",
        { userId: mockUser.id },
        expect.objectContaining({
          singletonKey: `fetch-user-emails-${mockUser.id}`,
        }),
      );
    });
  });

  describe("OAuth sign-up analytics", () => {
    const googleProfile = {
      id: "google-id-123",
      emails: [{ value: "test@example.com", verified: true }],
      displayName: "Test User",
    };
    const microsoftProfile = {
      id: "ms-id-1",
      mail: "test@example.com",
      userPrincipalName: "test@example.com",
    };
    const zohoProfile = { ZUID: "zuid-1", Email: "test@example.com" };

    const expectRegistered = (method: string) =>
      expect(captureEvent).toHaveBeenCalledWith(
        "user_registered",
        mockUser.id,
        {
          method,
        },
      );

    beforeEach(() => {
      usersService.create.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);
    });

    it("sends user_registered with method google when Google creates the account", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await service.validateGoogleUser(googleProfile, "access", "refresh");
      expectRegistered("google");
    });

    it("sends user_registered with method microsoft when Microsoft creates the account", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await service.validateMicrosoftUser(
        microsoftProfile,
        "access",
        "refresh",
      );
      expectRegistered("microsoft");
    });

    it("sends user_registered with method zoho when Zoho creates the account", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await service.validateZohoUser(zohoProfile, "access", "refresh");
      expectRegistered("zoho");
    });

    it("sends nothing when an existing user signs in", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      await service.validateGoogleUser(googleProfile, "access", "refresh");
      await service.validateMicrosoftUser(
        microsoftProfile,
        "access",
        "refresh",
      );
      await service.validateZohoUser(zohoProfile, "access", "refresh");
      expect(captureEvent).not.toHaveBeenCalled();
    });
  });

  describe("Microsoft sign-in identity (nOAuth)", () => {
    it("never matches an account by the tenant-controlled mail attribute", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      await service
        .validateMicrosoftUser(
          {
            id: "attacker-oid",
            mail: "victim@company.com",
            userPrincipalName: "attacker@evil.onmicrosoft.com",
          },
          "access",
          "refresh",
        )
        .catch(() => undefined);

      expect(usersService.findByEmail).not.toHaveBeenCalledWith(
        "victim@company.com",
      );
      expect(usersService.findByEmail).toHaveBeenCalledWith(
        "attacker@evil.onmicrosoft.com",
      );
    });

    it("refuses a guest UPN or a profile with only a mail attribute", () => {
      expect(() =>
        verifiedMicrosoftSignInEmail({
          userPrincipalName: "victim_company.com#EXT#@evil.onmicrosoft.com",
        }),
      ).toThrow();
      expect(() => verifiedMicrosoftSignInEmail({})).toThrow();
      expect(
        verifiedMicrosoftSignInEmail({ userPrincipalName: "me@contoso.com" }),
      ).toBe("me@contoso.com");
    });
  });

  describe("login", () => {
    it("should return JWT token and user data", async () => {
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.login(mockUser);

      expect(result.access_token).toBe("jwt-token");
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(jwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
      });
    });

    it("should log in an unapproved user in production now that the gate is removed", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      jwtService.sign.mockReturnValue("jwt-token");
      const unapprovedUser = { ...mockUser, isApproved: false };

      const result = await service.login(unapprovedUser);

      expect(result.access_token).toBe("jwt-token");
      process.env.NODE_ENV = originalEnv;
    });

    it("should include all user fields in response", async () => {
      jwtService.sign.mockReturnValue("jwt-token");
      const userWithAllFields = {
        ...mockUser,
        hasSeenTour: true,
        hasScannedHistory: true,
        isAdmin: true,
      };

      const result = await service.login(userWithAllFields);

      expect(result.user.hasSeenTour).toBe(true);
      expect(result.user.hasScannedHistory).toBe(true);
      expect(result.user.isAdmin).toBe(true);
    });

    it("should queue backlog processing when user was inactive", async () => {
      jwtService.sign.mockReturnValue("jwt-token");
      usersService.wasUserInactive.mockResolvedValue(true);
      usersService.updateLastActivity.mockResolvedValue(undefined);
      emailBacklogService.queueBacklogProcessing.mockResolvedValue({
        threadCount: 3,
      });

      await service.login(mockUser);

      // Allow the fire-and-forget promise to settle
      await Promise.resolve();

      expect(usersService.wasUserInactive).toHaveBeenCalledWith(mockUser.id);
      expect(usersService.updateLastActivity).toHaveBeenCalledWith(mockUser.id);
      expect(emailBacklogService.queueBacklogProcessing).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it("should queue backlog processing even when user was active (org volume cap can defer threads for active users)", async () => {
      jwtService.sign.mockReturnValue("jwt-token");
      usersService.wasUserInactive.mockResolvedValue(false);
      usersService.updateLastActivity.mockResolvedValue(undefined);
      emailBacklogService.queueBacklogProcessing.mockResolvedValue({
        threadCount: 5,
      });

      await service.login(mockUser);

      await Promise.resolve();

      expect(emailBacklogService.queueBacklogProcessing).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  describe("register", () => {
    it("creates an unverified account, emails a link, and issues no session", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const createdUser = {
        ...mockUser,
        id: "new-user",
        emailVerifiedAt: null,
      };
      usersService.create.mockResolvedValue(createdUser);

      const result = await service.register(
        "new@example.com",
        "a-strong-password",
        "New User",
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          isApproved: true,
          isAdmin: false,
        }),
      );
      expect(usersService.create.mock.calls[0][0]).not.toHaveProperty(
        "emailVerifiedAt",
      );
      expect(emailVerification.sendVerification).toHaveBeenCalledWith(
        createdUser,
      );
      expect(result).toEqual({ verificationRequired: true });
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it("should reject a password shorter than the minimum length", async () => {
      await expect(
        service.register("new@example.com", "short", "New User"),
      ).rejects.toThrow("at least");
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it("should reject registration when the email already exists", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register("test@example.com", "a-strong-password"),
      ).rejects.toThrow("already exists");
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe("setupPassword", () => {
    const mockToken = "valid-token-abcdef1234567890abcdef1234567890";
    const strongPassword = "a-strong-new-password";

    it("looks the token up by its hash, sets the password and marks the email verified", async () => {
      const userWithToken = { ...mockUser, emailVerifiedAt: null };
      usersService.findByPasswordSetupTokenHash.mockResolvedValue(
        userWithToken,
      );
      usersService.findOne.mockResolvedValue({
        ...userWithToken,
        isApproved: true,
      });
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.setupPassword(mockToken, strongPassword);

      expect(usersService.findByPasswordSetupTokenHash).toHaveBeenCalledWith(
        hashEmailedToken(mockToken),
      );
      expect(usersService.findAll).not.toHaveBeenCalled();
      expect(usersService.update).toHaveBeenCalledWith(
        userWithToken.id,
        expect.objectContaining({
          password: "hashed-password",
          passwordSetupTokenHash: null,
          passwordSetupTokenExpiresAt: null,
          isApproved: true,
          passwordChangedAt: expect.any(Date),
          emailVerifiedAt: expect.any(Date),
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        }),
      );
      expect(result.access_token).toBe("jwt-token");
      // Verify bcrypt uses updated cost factor (12 rounds per OWASP ASVS req 2.4.1)
      expect(bcrypt.hash).toHaveBeenCalledWith(strongPassword, 12);
    });

    it("keeps an existing verification timestamp", async () => {
      usersService.findByPasswordSetupTokenHash.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      await service.setupPassword(mockToken, strongPassword);

      expect(usersService.update.mock.calls[0][1]).not.toHaveProperty(
        "emailVerifiedAt",
      );
    });

    it("rejects an unknown or expired token", async () => {
      usersService.findByPasswordSetupTokenHash.mockResolvedValue(null);

      await expect(
        service.setupPassword("wrong-token", strongPassword),
      ).rejects.toThrow("Invalid or expired setup token");
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("rejects a missing token without querying", async () => {
      await expect(service.setupPassword("", strongPassword)).rejects.toThrow(
        "Invalid or expired setup token",
      );
      expect(usersService.findByPasswordSetupTokenHash).not.toHaveBeenCalled();
    });

    it("enforces the minimum password length", async () => {
      usersService.findByPasswordSetupTokenHash.mockResolvedValue(mockUser);

      await expect(service.setupPassword(mockToken, "short")).rejects.toThrow(
        "at least",
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("should silently return when email does not exist", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword("unknown@example.com"),
      ).resolves.toBeUndefined();
      expect(emailVerification.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it("emails a reset link when the email exists", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await service.forgotPassword(mockUser.email);

      expect(emailVerification.sendPasswordResetLink).toHaveBeenCalledWith(
        mockUser,
      );
      expect(boss.send).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("should delegate to setupPassword and return login response", async () => {
      usersService.findByPasswordSetupTokenHash.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.resetPassword(
        "valid-token-123",
        "a-strong-new-password",
      );

      expect(result.access_token).toBe("jwt-token");
    });
  });

  describe("password sign-in lockout and verification", () => {
    it("records a failure for a wrong password", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser(mockUser.email, "wrong"),
      ).resolves.toBeNull();
      expect(loginLockout.recordFailure).toHaveBeenCalledWith(mockUser.id);
      expect(loginLockout.recordSuccess).not.toHaveBeenCalled();
    });

    it("refuses a locked account without checking the password", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      loginLockout.assertNotLocked.mockImplementation(() => {
        throw new AccountLockedException(new Date(Date.now() + 60_000));
      });

      await expect(
        service.validateUser(mockUser.email, "anything"),
      ).rejects.toBeInstanceOf(AccountLockedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("tracks attempts on unknown addresses the same way", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await service.validateUser("nobody@example.com", "pw");

      expect(loginLockout.recordUnknownEmailAttempt).toHaveBeenCalledWith(
        "hashed-email",
      );
    });

    it("clears the count and requires a verified email after a correct password", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await service.validateUser(mockUser.email, "right");

      expect(loginLockout.recordSuccess).toHaveBeenCalledWith(mockUser);
      expect(
        emailVerification.assertVerifiedForPasswordSignIn,
      ).toHaveBeenCalledWith(mockUser);
    });

    it("refuses an unverified account and doesn't provision an org", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      emailVerification.assertVerifiedForPasswordSignIn.mockRejectedValue(
        new EmailNotVerifiedException(),
      );

      await expect(
        service.validateUser(mockUser.email, "right"),
      ).rejects.toBeInstanceOf(EmailNotVerifiedException);
      expect(ensurePersonalOrg).not.toHaveBeenCalled();
    });

    it("never checks verification when the password is wrong", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await service.validateUser(mockUser.email, "wrong");

      expect(
        emailVerification.assertVerifiedForPasswordSignIn,
      ).not.toHaveBeenCalled();
    });
  });

  describe("provider sign-in claims the address", () => {
    it("refuses a Google sign-in whose email Google hasn't verified", async () => {
      await expect(
        service.validateGoogleUser(
          {
            id: "g-1",
            emails: [{ value: "test@example.com", verified: false }],
          },
          "access",
          "refresh",
        ),
      ).rejects.toThrow("hasn't verified");
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it("claims an existing account matched by a verified Google address", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      usersService.findOne.mockResolvedValue(mockUser);

      await service.validateGoogleUser(
        { id: "g-1", emails: [{ value: mockUser.email, verified: "true" }] },
        "access",
        "refresh",
      );

      expect(emailVerification.claimForProviderSignIn).toHaveBeenCalledWith(
        mockUser,
      );
    });

    it("creates new provider accounts already verified", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...mockUser, id: "z-user" });

      await service.validateZohoUser(
        { ZUID: "1", Email: "new@zoho.example" },
        "access",
        "refresh",
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      );
      expect(emailVerification.claimForProviderSignIn).not.toHaveBeenCalled();
    });
  });

  describe("verifyMfaAndElevate", () => {
    it("should return elevated JWT when TOTP token is valid", async () => {
      totpService.verifyMfa.mockResolvedValue(true);
      jwtService.sign.mockReturnValue("elevated-jwt");

      const result = await service.verifyMfaAndElevate(
        mockUser.id,
        mockUser.email,
        "123456",
      );

      expect(result).toEqual({ access_token: "elevated-jwt" });
      // Signed with the default (session-length) expiry — NOT a shortened MFA
      // expiry — and stamped with mfaVerifiedAt so AdminGuard can enforce the
      // elevation recency window without the cookie expiring early.
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          mfaVerified: true,
          mfaVerifiedAt: expect.any(Number),
        }),
      );
      const [, signOptions] = jwtService.sign.mock.calls[0];
      expect(signOptions).toBeUndefined();
    });

    it("should return null when TOTP token is invalid", async () => {
      totpService.verifyMfa.mockResolvedValue(false);

      const result = await service.verifyMfaAndElevate(
        mockUser.id,
        mockUser.email,
        "000000",
      );

      expect(result).toBeNull();
    });
  });

  describe("setupMfa", () => {
    it("should delegate to TotpService.setupMfa", async () => {
      const setupData = {
        secret: "TESTSECRET",
        otpauthUrl: "otpauth://totp/...",
      };
      totpService.setupMfa.mockResolvedValue(setupData);

      const result = await service.setupMfa(mockUser.id);

      expect(result).toEqual(setupData);
      expect(totpService.setupMfa).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe("enableMfa", () => {
    it("should return true when token is valid", async () => {
      totpService.enableMfa.mockResolvedValue(true);
      const result = await service.enableMfa(mockUser.id, "123456");
      expect(result).toBe(true);
    });

    it("should return false when token is invalid", async () => {
      totpService.enableMfa.mockResolvedValue(false);
      const result = await service.enableMfa(mockUser.id, "000000");
      expect(result).toBe(false);
    });
  });

  describe("disableMfa", () => {
    it("should return true when token is valid", async () => {
      totpService.disableMfa.mockResolvedValue(true);
      const result = await service.disableMfa(mockUser.id, "123456");
      expect(result).toBe(true);
    });
  });

  describe("getMfaStatus", () => {
    it("should return the MFA status from TotpService", async () => {
      totpService.getMfaStatus.mockResolvedValue({ enabled: true });
      const result = await service.getMfaStatus(mockUser.id);
      expect(result).toEqual({ enabled: true });
    });
  });
});
