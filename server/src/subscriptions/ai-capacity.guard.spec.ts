import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import {
  AI_VOLUME_LIMIT_REACHED_CODE,
  AiCapacityGuard,
} from "./ai-capacity.guard";
import { SubscriptionsService } from "./subscriptions.service";

describe("AiCapacityGuard", () => {
  let guard: AiCapacityGuard;
  let mockExecutionContext: ExecutionContext;

  const mockSubscriptionsService = {
    checkAiCapacity: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCapacityGuard,
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
      ],
    }).compile();

    guard = module.get<AiCapacityGuard>(AiCapacityGuard);

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
    } as unknown as ExecutionContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const setRequest = (request: unknown) => {
    (
      mockExecutionContext.switchToHttp().getRequest as jest.Mock
    ).mockReturnValue(request);
  };

  describe("canActivate", () => {
    it("should return true when the user has AI capacity remaining", async () => {
      setRequest({ user: { userId: "user-123" } });
      mockSubscriptionsService.checkAiCapacity.mockResolvedValue({
        allowed: true,
        percentUsed: 10,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockSubscriptionsService.checkAiCapacity).toHaveBeenCalledWith(
        "user-123",
      );
    });

    it("should throw a 402 with the AI_VOLUME_LIMIT_REACHED code when capacity is exhausted", async () => {
      setRequest({ user: { userId: "user-123" } });
      mockSubscriptionsService.checkAiCapacity.mockResolvedValue({
        allowed: false,
        percentUsed: 120,
      });

      let thrown: HttpException | undefined;
      try {
        await guard.canActivate(mockExecutionContext);
      } catch (error) {
        thrown = error as HttpException;
      }

      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown?.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(thrown?.getResponse()).toEqual({
        message: "AI usage limit reached for your plan",
        code: AI_VOLUME_LIMIT_REACHED_CODE,
      });
    });

    it("should throw ForbiddenException when the user is not authenticated", async () => {
      setRequest({ user: {} });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSubscriptionsService.checkAiCapacity).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when the user object is missing", async () => {
      setRequest({});

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSubscriptionsService.checkAiCapacity).not.toHaveBeenCalled();
    });

    it("should propagate errors from the subscriptions service", async () => {
      setRequest({ user: { userId: "user-123" } });
      mockSubscriptionsService.checkAiCapacity.mockRejectedValue(
        new Error("Service error"),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Service error",
      );
    });
  });
});
