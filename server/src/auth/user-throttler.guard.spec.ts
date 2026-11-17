/**
 * Tests for UserThrottlerGuard — focusing on #1096 fixes:
 *   Fix A: Accurate 429 headers (X-RateLimit-Triggered-Tier, Retry-After)
 *   Fix B: Feedback tier only applied to feedback routes
 */

import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerModuleOptions, ThrottlerStorage } from "@nestjs/throttler";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { UserThrottlerGuard } from "./user-throttler.guard";

/** Minimal ThrottlerLimitDetail shape used in tests. */
interface TestThrottlerDetail {
  ttl: number;
  limit: number;
  key: string;
  tracker: string;
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

function makeDetail(
  overrides: Partial<TestThrottlerDetail> = {},
): TestThrottlerDetail {
  return {
    ttl: 60,
    limit: 500,
    key: "abc123",
    tracker: "user-1",
    totalHits: 501,
    timeToExpire: 30,
    isBlocked: true,
    timeToBlockExpire: 30,
    ...overrides,
  };
}

function makeContext(
  url: string,
  userId?: string,
): {
  context: ExecutionContext;
  mockSetHeader: jest.Mock;
  mockRequest: Record<string, unknown>;
} {
  const mockSetHeader = jest.fn();
  const mockRequest: Record<string, unknown> = {
    url,
    method: "GET",
    ip: "127.0.0.1",
    headers: { "user-agent": "test-agent" },
    user: userId ? { userId } : undefined,
  };

  const context = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue({ setHeader: mockSetHeader }),
    }),
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
  } as unknown as ExecutionContext;

  return { context, mockSetHeader, mockRequest };
}

describe("UserThrottlerGuard", () => {
  let guard: UserThrottlerGuard;
  let mockErrorTracking: jest.Mocked<Partial<ErrorTrackingService>>;

  beforeEach(() => {
    mockErrorTracking = {
      captureEvent: jest.fn(),
    };

    const mockOptions: ThrottlerModuleOptions = [
      { name: "feedback", ttl: 3_600_000, limit: 10 },
      { name: "default", ttl: 60_000, limit: 500 },
      { name: "polling", ttl: 60_000, limit: 3000 },
    ];

    const mockStorage: Partial<ThrottlerStorage> = {
      increment: jest.fn(),
    };

    const mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    guard = new UserThrottlerGuard(
      mockOptions,
      mockStorage as ThrottlerStorage,
      mockReflector,
      mockErrorTracking as ErrorTrackingService,
    );

    // Simulate onModuleInit throttlers setup
    (guard as unknown as { throttlers: Array<{ name: string }> }).throttlers = [
      { name: "feedback", ttl: 3_600_000, limit: 10 } as never,
      { name: "default", ttl: 60_000, limit: 500 } as never,
      { name: "polling", ttl: 60_000, limit: 3000 } as never,
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getTracker", () => {
    it("returns userId when user is authenticated", async () => {
      const req = { user: { userId: "user-42" } } as Record<string, unknown>;
      const result = await (
        guard as unknown as {
          getTracker(req: Record<string, unknown>): Promise<string>;
        }
      ).getTracker(req);
      expect(result).toBe("user-42");
    });

    it("falls back to IP for unauthenticated requests", async () => {
      const req = { ip: "10.0.0.1" } as Record<string, unknown>;
      const result = await (
        guard as unknown as {
          getTracker(req: Record<string, unknown>): Promise<string>;
        }
      ).getTracker(req);
      expect(result).toBe("10.0.0.1");
    });

    it("falls back to 'unknown' when both userId and IP are absent", async () => {
      const req = {} as Record<string, unknown>;
      const result = await (
        guard as unknown as {
          getTracker(req: Record<string, unknown>): Promise<string>;
        }
      ).getTracker(req);
      expect(result).toBe("unknown");
    });
  });

  describe("handleRequest — Fix B: feedback tier scoping", () => {
    function makeThrottlerRequest(tierName: string, url: string) {
      const { context } = makeContext(url, "user-1");
      const superHandleRequest = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          "handleRequest",
        )
        .mockResolvedValue(true);

      return {
        context,
        superHandleRequest,
        requestProps: {
          context,
          limit: 10,
          ttl: 3_600_000,
          throttler: { name: tierName } as never,
          blockDuration: 3_600_000,
          getTracker: jest.fn(),
          generateKey: jest.fn(),
        },
      };
    }

    it("skips the feedback tier for non-feedback routes", async () => {
      const { requestProps, superHandleRequest } = makeThrottlerRequest(
        "feedback",
        "/priority/email-123/prioritize",
      );

      const result = await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      expect(result).toBe(true);
      expect(superHandleRequest).not.toHaveBeenCalled();
    });

    it("applies the feedback tier to feedback routes (/feedback/*)", async () => {
      const { requestProps, superHandleRequest } = makeThrottlerRequest(
        "feedback",
        "/feedback",
      );

      await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      expect(superHandleRequest).toHaveBeenCalledWith(requestProps);
    });

    it("applies the feedback tier to /priority/star-feedback", async () => {
      const { requestProps, superHandleRequest } = makeThrottlerRequest(
        "feedback",
        "/priority/star-feedback",
      );

      await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      expect(superHandleRequest).toHaveBeenCalledWith(requestProps);
    });

    it("applies the feedback tier to /priority/:id/feedback pattern", async () => {
      const { requestProps, superHandleRequest } = makeThrottlerRequest(
        "feedback",
        "/priority/email-abc/feedback",
      );

      await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      expect(superHandleRequest).toHaveBeenCalledWith(requestProps);
    });

    it("always applies the default tier regardless of route", async () => {
      const { requestProps, superHandleRequest } = makeThrottlerRequest(
        "default",
        "/priority/email-123/prioritize",
      );

      await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      expect(superHandleRequest).toHaveBeenCalledWith(requestProps);
    });

    it("stores the throttler name on the request for later use by throwThrottlingException", async () => {
      const { requestProps, context, superHandleRequest } =
        makeThrottlerRequest("default", "/priority/email-123/prioritize");

      superHandleRequest.mockResolvedValue(true);

      await (
        guard as unknown as { handleRequest: (p: unknown) => Promise<boolean> }
      ).handleRequest(requestProps);

      const req = context.switchToHttp().getRequest() as Record<
        string,
        unknown
      >;
      expect(req["__rateLimit_triggeringTier"]).toBe("default");
    });
  });

  describe("throwThrottlingException — Fix A: accurate 429 headers", () => {
    it("sets X-RateLimit-Triggered-Tier header from the blocking tier", async () => {
      const { context, mockSetHeader, mockRequest } = makeContext(
        "/priority/email-123/prioritize",
        "user-1",
      );
      // Simulate handleRequest having stored the tier name
      mockRequest["__rateLimit_triggeringTier"] = "default";

      await expect(
        guard["throwThrottlingException"](
          context,
          makeDetail({ ttl: 60, limit: 500, timeToBlockExpire: 30 }),
        ),
      ).rejects.toThrow(HttpException);

      expect(mockSetHeader).toHaveBeenCalledWith(
        "X-RateLimit-Triggered-Tier",
        "default",
      );
    });

    it("sets Retry-After from the blocking tier's timeToBlockExpire (seconds)", async () => {
      const { context, mockSetHeader, mockRequest } = makeContext(
        "/priority/email-123/prioritize",
        "user-1",
      );
      mockRequest["__rateLimit_triggeringTier"] = "default";

      await expect(
        guard["throwThrottlingException"](
          context,
          makeDetail({ timeToBlockExpire: 45 }),
        ),
      ).rejects.toThrow(HttpException);

      expect(mockSetHeader).toHaveBeenCalledWith("Retry-After", "45");
    });

    it("converts Retry-After from milliseconds to seconds when value > 1000", async () => {
      const { context, mockSetHeader, mockRequest } = makeContext(
        "/priority/email-123/prioritize",
        "user-1",
      );
      mockRequest["__rateLimit_triggeringTier"] = "polling";

      await expect(
        guard["throwThrottlingException"](
          context,
          makeDetail({ timeToBlockExpire: 60_000 }),
        ),
      ).rejects.toThrow(HttpException);

      expect(mockSetHeader).toHaveBeenCalledWith("Retry-After", "60");
    });

    it("uses the feedback tier and returns feedback-specific message on feedback routes", async () => {
      const { context, mockSetHeader, mockRequest } = makeContext(
        "/priority/email-abc/feedback",
        "user-1",
      );
      mockRequest["__rateLimit_triggeringTier"] = "feedback";

      let thrownError: HttpException | undefined;
      try {
        await guard["throwThrottlingException"](
          context,
          makeDetail({ ttl: 3_600_000, limit: 10, timeToBlockExpire: 3600 }),
        );
      } catch (err) {
        thrownError = err as HttpException;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(thrownError?.message).toContain("feedback");
      expect(mockSetHeader).toHaveBeenCalledWith(
        "X-RateLimit-Triggered-Tier",
        "feedback",
      );
    });

    it("returns generic message for non-feedback routes", async () => {
      const { context, mockRequest } = makeContext("/api/emails", "user-1");
      mockRequest["__rateLimit_triggeringTier"] = "default";

      let thrownError: HttpException | undefined;
      try {
        await guard["throwThrottlingException"](context, makeDetail());
      } catch (err) {
        thrownError = err as HttpException;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).not.toContain("feedback");
      expect(thrownError?.message).toContain("Too many requests");
    });

    it("falls back to URL heuristics when tier name is not on the request", async () => {
      const { context, mockSetHeader } = makeContext(
        "/priority/email-123/progress",
        "user-1",
      );
      // No __rateLimit_triggeringTier set on request

      await expect(
        guard["throwThrottlingException"](context, makeDetail()),
      ).rejects.toThrow(HttpException);

      expect(mockSetHeader).toHaveBeenCalledWith(
        "X-RateLimit-Triggered-Tier",
        "polling",
      );
    });

    it("captures a PostHog event with the correct tier name", async () => {
      const { context, mockRequest } = makeContext(
        "/priority/email-123/prioritize",
        "user-42",
      );
      mockRequest["__rateLimit_triggeringTier"] = "default";

      await expect(
        guard["throwThrottlingException"](
          context,
          makeDetail({
            ttl: 60,
            limit: 500,
            totalHits: 501,
            timeToBlockExpire: 30,
          }),
        ),
      ).rejects.toThrow(HttpException);

      expect(mockErrorTracking.captureEvent).toHaveBeenCalledWith(
        "rate_limit_exceeded",
        "user-42",
        expect.objectContaining({
          tier: "default",
          limit: 500,
          requestCount: 501,
        }),
      );
    });

    it("throws a 429 HttpException", async () => {
      const { context, mockRequest } = makeContext("/api/emails", "user-1");
      mockRequest["__rateLimit_triggeringTier"] = "default";

      let thrownError: HttpException | undefined;
      try {
        await guard["throwThrottlingException"](context, makeDetail());
      } catch (err) {
        thrownError = err as HttpException;
      }

      expect(thrownError).toBeInstanceOf(HttpException);
      expect(thrownError?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it("does not throw if PostHog captureEvent fails", async () => {
      const { context, mockRequest } = makeContext("/api/emails", "user-1");
      mockRequest["__rateLimit_triggeringTier"] = "default";
      mockErrorTracking.captureEvent!.mockImplementation(() => {
        throw new Error("PostHog unavailable");
      });

      let thrownError: HttpException | undefined;
      try {
        await guard["throwThrottlingException"](context, makeDetail());
      } catch (err) {
        thrownError = err as HttpException;
      }

      // Should still throw the 429, not the PostHog error
      expect(thrownError).toBeInstanceOf(HttpException);
      expect(thrownError?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});
