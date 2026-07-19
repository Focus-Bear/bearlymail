import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailAccountRequiredGuard } from "./gmail-required.guard";

describe("EmailAccountRequiredGuard", () => {
  let guard: EmailAccountRequiredGuard;
  let googleAccountsService: GoogleAccountsService;
  let usersService: UsersService;
  let mockExecutionContext: ExecutionContext;

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn(),
  };

  const mockOffice365AccountsService = {
    hasConnectedOffice365: jest.fn(),
  };

  const mockZohoAccountsService = {
    hasConnectedZoho: jest.fn(),
  };

  const mockAppleMailAccountsService = {
    hasConnectedAppleMail: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    findOneWithTokens: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAccountRequiredGuard,
        {
          provide: GoogleAccountsService,
          useValue: mockGoogleAccountsService,
        },
        {
          provide: Office365AccountsService,
          useValue: mockOffice365AccountsService,
        },
        {
          provide: ZohoAccountsService,
          useValue: mockZohoAccountsService,
        },
        {
          provide: AppleMailAccountsService,
          useValue: mockAppleMailAccountsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    guard = module.get<EmailAccountRequiredGuard>(EmailAccountRequiredGuard);

    // Default: no provider connected (overridden per test as needed)
    mockOffice365AccountsService.hasConnectedOffice365.mockResolvedValue(false);
    mockZohoAccountsService.hasConnectedZoho.mockResolvedValue(false);
    mockAppleMailAccountsService.hasConnectedAppleMail.mockResolvedValue(false);
    googleAccountsService = module.get<GoogleAccountsService>(
      GoogleAccountsService,
    );
    usersService = module.get<UsersService>(UsersService);

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
    } as unknown as ExecutionContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("canActivate", () => {
    let originalCI: string | undefined;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      // Save and clear CI env vars so the guard does not short-circuit via the
      // isCiTestEnv path (CI=true + NODE_ENV=test) during unit tests that need
      // to exercise the real guard logic.
      originalCI = process.env.CI;
      originalNodeEnv = process.env.NODE_ENV;
      delete process.env.CI;
      delete process.env.NODE_ENV;
    });

    afterEach(() => {
      delete process.env.CI_SEARCH_FALLBACK;
      // Restore original values
      if (originalCI !== undefined) {
        process.env.CI = originalCI;
      } else {
        delete process.env.CI;
      }
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it("should return true immediately when CI_SEARCH_FALLBACK is set", async () => {
      process.env.CI_SEARCH_FALLBACK = "true";

      // Guard should bypass all checks — no services called
      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(googleAccountsService.hasConnectedGmail).not.toHaveBeenCalled();
      expect(usersService.findOneWithTokens).not.toHaveBeenCalled();
    });

    it("should return true when user has connected Gmail accounts (new system)", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(true);
      mockUsersService.findOneWithTokens.mockResolvedValue({
        id: userId,
        // No legacy token
        googleCalendarAccessToken: null,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(googleAccountsService.hasConnectedGmail).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should return true when user has legacy Gmail token", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(false);
      mockUsersService.findOneWithTokens.mockResolvedValue({
        id: userId,
        googleCalendarAccessToken: "legacy-token",
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(googleAccountsService.hasConnectedGmail).toHaveBeenCalledWith(
        userId,
      );
      expect(usersService.findOneWithTokens).toHaveBeenCalledWith(userId);
    });

    it("should return true when user has both new and legacy Gmail", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(true);
      mockUsersService.findOneWithTokens.mockResolvedValue({
        id: userId,
        googleCalendarAccessToken: "legacy-token",
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it("should throw UnauthorizedException when user is missing", async () => {
      // No user object
      const mockRequest = {};

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Authentication required",
      );
      expect(googleAccountsService.hasConnectedGmail).not.toHaveBeenCalled();
    });

    it("should throw UnauthorizedException when userId is missing (using userId field)", async () => {
      // No userId
      const mockRequest = {
        user: {},
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User ID not found",
      );
    });

    it("should throw UnauthorizedException when userId is missing (using id field)", async () => {
      // id is undefined
      const mockRequest = {
        user: { id: undefined },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User ID not found",
      );
    });

    it("should use id field when userId is not present", async () => {
      const userId = "user-123";
      // Using id instead of userId
      const mockRequest = {
        user: { id: userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(true);
      mockUsersService.findOneWithTokens.mockResolvedValue({
        id: userId,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(googleAccountsService.hasConnectedGmail).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should throw UnauthorizedException when no Gmail connection exists", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(false);
      mockUsersService.findOneWithTokens.mockResolvedValue({
        id: userId,
        // No legacy token
        googleCalendarAccessToken: null,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Email account connection required",
      );
      expect(googleAccountsService.hasConnectedGmail).toHaveBeenCalledWith(
        userId,
      );
      expect(usersService.findOneWithTokens).toHaveBeenCalledWith(userId);
    });

    it("should throw UnauthorizedException when user is not found in database", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(false);
      mockUsersService.findOneWithTokens.mockResolvedValue(null);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Email account connection required",
      );
    });

    it("should handle errors from googleAccountsService", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockRejectedValue(
        new Error("Service error"),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Service error",
      );
    });

    it("should handle errors from usersService", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockGoogleAccountsService.hasConnectedGmail.mockResolvedValue(false);
      mockUsersService.findOneWithTokens.mockRejectedValue(
        new Error("Database error"),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Database error",
      );
    });
  });
});
