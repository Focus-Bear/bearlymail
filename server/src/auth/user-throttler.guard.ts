import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { Request, Response } from "express";

import {
  FEEDBACK_PATH_PATTERN,
  FEEDBACK_PATHS,
  POLLING_PATH_PATTERN,
  POSTHOG_EVENTS,
  THROTTLE_TIERS,
} from "../constants/throttle-constants";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";

const MS_PER_SECOND = 1000;

/** Request-local key used to pass the blocking tier name to throwThrottlingException. */
const CURRENT_THROTTLER_NAME_KEY = "__rateLimit_triggeringTier";

/**
 * Throttler guard keyed on authenticated userId rather than IP address.
 *
 * Throttling by IP is incorrect in multi-tenant apps where many users may
 * share a NAT gateway. Since every priority endpoint is behind JwtAuthGuard,
 * the userId is always available on authenticated requests.
 *
 * Public routes (no JWT) fall back to client IP.
 *
 * ## Header behaviour (fixes #1096 — headers show wrong tier)
 *
 * Problem: NestJS base guard sets `Retry-After-{tier}` (not `Retry-After`) when
 * a named tier blocks, and there is no indication of *which* tier triggered the
 * 429. Clients checking the generic `Retry-After` or `X-RateLimit-Remaining`
 * headers therefore see misleading data (remaining capacity from a different tier).
 *
 * Fix A — on 429 responses we now set:
 *   - `X-RateLimit-Triggered-Tier: {tierName}`  ← identifies the blocking tier
 *   - `Retry-After: {seconds}`                  ← canonical header from the blocking tier
 *
 * ## Feedback-tier scope fix (part of #1096)
 *
 * Problem: the "feedback" tier (10 req/hr) was applied globally to every route.
 * Non-feedback routes could be silently blocked by the feedback tier while the
 * "default" tier (500 req/min) still showed plenty of remaining capacity.
 *
 * Fix B — handleRequest now skips the feedback tier entirely for non-feedback
 * routes. Only routes matching FEEDBACK_PATHS / FEEDBACK_PATH_PATTERN / the
 * `/feedback` controller prefix are subject to the feedback-tier limit.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly errorTracking: ErrorTrackingService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    return user?.userId ?? String(req.ip ?? "unknown");
  }

  /**
   * Override handleRequest to:
   * 1. Skip the "feedback" tier entirely on non-feedback routes (Fix B).
   * 2. Store the current throttler name on the request object so that
   *    throwThrottlingException can report the correct tier (Fix A).
   *
   * Storing state on the request object is safe for concurrent requests because
   * each HTTP request has its own `req` instance, and handleRequest is called
   * sequentially within a single request's canActivate loop.
   */
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, throttler } = requestProps;
    const req = context
      .switchToHttp()
      .getRequest<Request & Record<string, unknown>>();

    // Fix B: skip the feedback tier entirely for non-feedback routes.
    if (
      throttler.name === THROTTLE_TIERS.FEEDBACK &&
      !this.isFeedbackRoute(req)
    ) {
      return true;
    }

    // Fix A (part 1): record which tier is currently being evaluated.
    // If this tier blocks, throwThrottlingException will read this value.
    req[CURRENT_THROTTLER_NAME_KEY] = throttler.name;

    return super.handleRequest(requestProps);
  }

  /**
   * Override throwThrottlingException to add accurate 429 headers (Fix A).
   *
   * - `X-RateLimit-Triggered-Tier` identifies the tier that blocked.
   * - `Retry-After` is set as the canonical (RFC 7231) header pointing to the
   *   blocking tier's reset time, replacing the tier-suffixed `Retry-After-{tier}`
   *   that the base guard emits (which most clients don't recognise).
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { userId?: string } } & Record<string, unknown>
      >();
    const response = context.switchToHttp().getResponse<Response>();

    const isFeedbackRoute = this.isFeedbackRoute(request);

    // Resolve tier name: prefer value stored by handleRequest (Fix A, part 2).
    const tierName =
      typeof request[CURRENT_THROTTLER_NAME_KEY] === "string"
        ? (request[CURRENT_THROTTLER_NAME_KEY] as string)
        : this.inferTierFromContext(request, isFeedbackRoute);

    // Set the triggered-tier header so clients know which limit they hit.
    response.setHeader("X-RateLimit-Triggered-Tier", tierName);

    // Set a canonical Retry-After from the blocking tier's reset time.
    // timeToBlockExpire is in seconds per ThrottlerStorageRecord interface.
    const retryAfter = throttlerLimitDetail.timeToBlockExpire;
    if (retryAfter > 0) {
      // If value looks like milliseconds (> 1000), convert to seconds.
      const retryAfterSeconds =
        retryAfter > MS_PER_SECOND
          ? Math.ceil(retryAfter / MS_PER_SECOND)
          : retryAfter;
      response.setHeader("Retry-After", String(retryAfterSeconds));
    }

    // Emit a PostHog event with diagnostic info for rate limit hits.
    try {
      const userId = request.user?.userId;
      const rawTtl = throttlerLimitDetail.ttl;

      const ttlSeconds =
        rawTtl > MS_PER_SECOND ? Math.round(rawTtl / MS_PER_SECOND) : rawTtl;

      this.errorTracking.captureEvent(
        POSTHOG_EVENTS.RATE_LIMIT_EXCEEDED,
        userId,
        {
          endpoint: request.url,
          method: request.method,
          requestCount: throttlerLimitDetail.totalHits,
          limit: throttlerLimitDetail.limit,
          tier: tierName,
          ttlSeconds,
          ip: request.ip,
          userAgent: request.headers?.["user-agent"],
        },
      );
    } catch (_err) {
      // Don't fail the request if PostHog capture fails - log and continue to throw
      // (ErrorTrackingService already logs failures internally)
    }

    const message = isFeedbackRoute
      ? "Too many feedback submissions. Please wait before submitting again."
      : "Too many requests. Please slow down.";

    throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Returns true when the request URL matches a feedback-related route.
   * Used for tier-scoping (Fix B) and error message selection.
   */
  private isFeedbackRoute(request: Request): boolean {
    if (typeof request.url !== "string") return false;
    return (
      FEEDBACK_PATHS.some((feedbackPath) =>
        request.url.endsWith(feedbackPath),
      ) ||
      FEEDBACK_PATH_PATTERN.test(request.url) ||
      request.url.startsWith("/feedback")
    );
  }

  /**
   * URL-heuristic fallback for tier detection when the request-local key is
   * absent (e.g. if handleRequest was bypassed).
   */
  private inferTierFromContext(
    request: Request,
    isFeedbackRoute: boolean,
  ): string {
    if (isFeedbackRoute) return THROTTLE_TIERS.FEEDBACK;
    if (
      typeof request.url === "string" &&
      POLLING_PATH_PATTERN.test(request.url)
    ) {
      return THROTTLE_TIERS.POLLING;
    }
    return THROTTLE_TIERS.DEFAULT;
  }
}
