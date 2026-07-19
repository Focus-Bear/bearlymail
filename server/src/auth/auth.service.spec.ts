import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import type { PgBoss } from "pg-boss";

import {
  DeletedAccount,
  DeletionReason,
} from "../database/entities/deleted-account.entity";
import { User } from "../database/entities/user.entity";
import { Waitlist } from "../database/entities/waitlist.entity";
import { EmailBacklogService } from "../emails/email-backlog.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { UsersService } from "../users/users.service";
import { WaitlistService } from "../waitlist/waitlist.service";
import { AuthService } from "./auth.service";
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
  let waitlistService: jest.Mocked<WaitlistService>;
  let emailBacklogService: jest.Mocked<EmailBacklogService>;
  let totpService: jest.Mocked<TotpService>;

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
    passwordSetupToken: null,
    passwordSetupTokenExpiresAt: null,
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

    const mockWaitlistService = {
      findByEmail: jest.fn().mockResolvedValue(null),
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

    const mockOrganizationsService = {
      ensurePersonalOrg: jest.fn().mockResolvedValue({ id: "org-1" }),
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
          provide: WaitlistService,
          useValue: mockWaitlistService,
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    boss = module.get("PG_BOSS");
    waitlistService = module.get(WaitlistService);
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

    it("should throw error when user is not approved", async () => {
      const unapprovedUser = { ...mockUser, isApproved: false };
      usersService.findByEmail.mockResolvedValue(unapprovedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.validateUser("test@example.com", "password"),
      ).rejects.toThrow("Your account is pending approval");
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
      emails: [{ value: "test@example.com" }],
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
          isApproved: false,
          isAdmin: false,
        }),
      );
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty("password");
    });

    it("should auto-approve and make admin for jeremy@focusbear.io", async () => {
      const jeremyProfile = {
        ...mockProfile,
        emails: [{ value: "jeremy@focusbear.io" }],
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

    it("should throw error when user is not approved (unless jeremy)", async () => {
      const unapprovedUser = { ...mockUser, isApproved: false };
      usersService.findByEmail.mockResolvedValue(unapprovedUser);
      usersService.update.mockResolvedValue(unapprovedUser);
      usersService.findOne.mockResolvedValue(unapprovedUser);
      // User is on waitlist but not approved
      waitlistService.findByEmail.mockResolvedValue({
        email: "test@example.com",
        approved: false,
      } as Waitlist);

      await expect(
        service.validateGoogleUser(
          mockProfile,
          "access-token",
          "refresh-token",
        ),
      ).rejects.toThrow("Your account is pending approval");
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

    it("should throw UnauthorizedException when user is not approved in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const unapprovedUser = { ...mockUser, isApproved: false };

      await expect(service.login(unapprovedUser)).rejects.toThrow(
        UnauthorizedException,
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("should auto-approve user in development mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      const unapprovedUser = { ...mockUser, isApproved: false };
      usersService.update.mockResolvedValue({
        ...unapprovedUser,
        isApproved: true,
      });

      await service.login(unapprovedUser);

      expect(usersService.update).toHaveBeenCalledWith(unapprovedUser.id, {
        isApproved: true,
      });

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
    it("should throw error indicating registration is closed", async () => {
      await expect(
        service.register("test@example.com", "password", "Name"),
      ).rejects.toThrow("Registration is currently closed");
    });
  });

  describe("setupPassword", () => {
    const mockToken = "valid-token-abcdef1234567890abcdef1234567890";
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);

    it("should setup password and approve user with valid token, setting passwordChangedAt", async () => {
      const userWithToken = {
        ...mockUser,
        passwordSetupToken: mockToken,
        passwordSetupTokenExpiresAt: futureDate,
      };
      usersService.findAll.mockResolvedValue([userWithToken]);
      usersService.update.mockResolvedValue({
        ...userWithToken,
        password: "hashed-password",
        passwordSetupToken: null,
        passwordSetupTokenExpiresAt: null,
        isApproved: true,
      });
      usersService.findOne.mockResolvedValue({
        ...userWithToken,
        isApproved: true,
      });
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.setupPassword(mockToken, "new-password");

      expect(usersService.update).toHaveBeenCalledWith(
        userWithToken.id,
        expect.objectContaining({
          password: "hashed-password",
          passwordSetupToken: null,
          passwordSetupTokenExpiresAt: null,
          isApproved: true,
          passwordChangedAt: expect.any(Date),
        }),
      );
      expect(result.access_token).toBe("jwt-token");
      // Verify bcrypt uses updated cost factor (12 rounds per OWASP ASVS req 2.4.1)
      expect(bcrypt.hash).toHaveBeenCalledWith("new-password", 12);
    });

    it("should throw error for invalid token", async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      await expect(
        service.setupPassword("wrong-token-that-does-not-match", "password"),
      ).rejects.toThrow("Invalid or expired setup token");
    });

    it("should throw error for expired token", async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      const userWithExpiredToken = {
        ...mockUser,
        passwordSetupToken: mockToken,
        passwordSetupTokenExpiresAt: pastDate,
      };
      usersService.findAll.mockResolvedValue([userWithExpiredToken]);

      await expect(
        service.setupPassword(mockToken, "password"),
      ).rejects.toThrow("Invalid or expired setup token");
    });

    it("should throw error when token is null", async () => {
      const userWithNullToken = {
        ...mockUser,
        passwordSetupToken: null,
        passwordSetupTokenExpiresAt: null,
      };
      usersService.findAll.mockResolvedValue([userWithNullToken]);

      await expect(
        service.setupPassword(mockToken, "password"),
      ).rejects.toThrow("Invalid or expired setup token");
    });

    it("should reject token of different length (constant-time comparison)", async () => {
      const userWithToken = {
        ...mockUser,
        passwordSetupToken: mockToken,
        passwordSetupTokenExpiresAt: futureDate,
      };
      usersService.findAll.mockResolvedValue([userWithToken]);

      // A token that is a prefix of mockToken — the SHA-256 hash comparison
      // correctly rejects it because different inputs produce different digests
      await expect(
        service.setupPassword(mockToken.slice(0, 10), "password"),
      ).rejects.toThrow("Invalid or expired setup token");
    });
  });

  describe("forgotPassword", () => {
    it("should silently return when email does not exist", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword("unknown@example.com"),
      ).resolves.toBeUndefined();
      expect(usersService.update).not.toHaveBeenCalled();
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("should update user with reset token and queue email job when email exists", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue(mockUser);
      boss.send.mockResolvedValue(undefined);

      await service.forgotPassword(mockUser.email);

      expect(usersService.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          passwordSetupToken: expect.any(String),
          passwordSetupTokenExpiresAt: expect.any(Date),
        }),
      );
      expect(boss.send).toHaveBeenCalledWith(
        "send-password-reset-email",
        expect.objectContaining({
          userId: mockUser.id,
          email: mockUser.email,
          token: expect.any(String),
          resetUrl: expect.stringContaining("/reset-password?token="),
        }),
      );
    });
  });

  describe("resetPassword", () => {
    const mockToken = "valid-token-123";

    it("should delegate to setupPassword and return login response", async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);
      const userWithToken = {
        ...mockUser,
        passwordSetupToken: mockToken,
        passwordSetupTokenExpiresAt: futureDate,
      };
      usersService.findAll.mockResolvedValue([userWithToken]);
      usersService.update.mockResolvedValue(userWithToken);
      usersService.findOne.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue("jwt-token");

      const result = await service.resetPassword(mockToken, "new-password");

      expect(result.access_token).toBe("jwt-token");
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
