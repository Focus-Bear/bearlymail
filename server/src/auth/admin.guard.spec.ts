import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { UsersService } from "../users/users.service";

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

  describe("canActivate", () => {
    it("should return true for admin user", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should return false for non-admin user", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: false,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should return false when user isAdmin is undefined", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        // isAdmin is undefined
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should return false when userId is missing from request", async () => {
      const mockRequest = {
        user: {}, // No userId
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user object is missing from request", async () => {
      const mockRequest = {}; // No user object

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user is not found", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockResolvedValue(null);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should handle errors from usersService gracefully", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockRejectedValue(new Error("Database error"));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Database error",
      );
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should return false when isAdmin is explicitly false", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: false,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });
  });
});
