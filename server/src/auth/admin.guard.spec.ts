import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service";
import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
  let guard: AdminGuard;
  let usersService: UsersService;
  let mockExecutionContext: ExecutionContext;

  const mockUsersService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
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

  const makeRequest = (userId: string | undefined, mfaVerified = false) => ({
    user: userId ? { userId, mfaVerified } : {},
  });

  describe("canActivate", () => {
    it("should return true for admin user with MFA enabled and verified", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should return false for non-admin user", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: false,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should throw ForbiddenException (MFA_SETUP_REQUIRED) when admin has no MFA", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: false,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (err: unknown) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_SETUP_REQUIRED",
        });
      }
    });

    it("should throw ForbiddenException (MFA_VERIFICATION_REQUIRED) when JWT lacks mfaVerified", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, false));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (err: unknown) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_VERIFICATION_REQUIRED",
        });
      }
    });

    it("should return false when isAdmin is undefined", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({ id: userId });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should return false when userId is missing from request", async () => {
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue({ user: {} });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user object is missing from request", async () => {
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue({});

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user is not found in DB", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockResolvedValue(null);

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should propagate errors from usersService", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockRejectedValue(new Error("Database error"));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Database error",
      );
    });
  });
});
