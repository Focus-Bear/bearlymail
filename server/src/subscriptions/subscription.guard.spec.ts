import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { SubscriptionGuard } from "./subscription.guard";
import { SubscriptionsService } from "./subscriptions.service";

describe("SubscriptionGuard", () => {
  let guard: SubscriptionGuard;
  let subscriptionsService: SubscriptionsService;
  let mockExecutionContext: ExecutionContext;

  const mockSubscriptionsService = {
    hasActiveSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
      ],
    }).compile();

    guard = module.get<SubscriptionGuard>(SubscriptionGuard);
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);

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
    it("should return true when user has active subscription", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockSubscriptionsService.hasActiveSubscription.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(subscriptionsService.hasActiveSubscription).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should throw ForbiddenException when user does not have active subscription", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockSubscriptionsService.hasActiveSubscription.mockResolvedValue(false);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Active subscription required",
      );
      expect(subscriptionsService.hasActiveSubscription).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should throw ForbiddenException when userId is missing", async () => {
      // No userId
      const mockRequest = {
        user: {},
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User not authenticated",
      );
      expect(subscriptionsService.hasActiveSubscription).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when user object is missing", async () => {
      // No user object
      const mockRequest = {};

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User not authenticated",
      );
      expect(subscriptionsService.hasActiveSubscription).not.toHaveBeenCalled();
    });

    it("should handle errors from subscriptionsService", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      mockSubscriptionsService.hasActiveSubscription.mockRejectedValue(
        new Error("Service error"),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Service error",
      );
      expect(subscriptionsService.hasActiveSubscription).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should handle null userId", async () => {
      const mockRequest = {
        user: { userId: null },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User not authenticated",
      );
    });

    it("should handle undefined userId", async () => {
      const mockRequest = {
        user: { userId: undefined },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "User not authenticated",
      );
    });
  });
});
