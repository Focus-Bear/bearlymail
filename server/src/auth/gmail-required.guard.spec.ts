import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { GmailRequiredGuard } from "./gmail-required.guard";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { UsersService } from "../users/users.service";

describe("GmailRequiredGuard", () => {
  let guard: GmailRequiredGuard;
  let googleAccountsService: GoogleAccountsService;
  let usersService: UsersService;
  let mockExecutionContext: ExecutionContext;

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    findOneWithTokens: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailRequiredGuard,
        {
          provide: GoogleAccountsService,
          useValue: mockGoogleAccountsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    guard = module.get<GmailRequiredGuard>(GmailRequiredGuard);
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
        "Gmail account connection required",
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
        "Gmail account connection required",
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
