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
  ThrottlerStorage,
} from "@nestjs/throttler";
import { Request } from "express";

import {
  FEEDBACK_PATH_PATTERN,
  FEEDBACK_PATHS,
  POLLING_PATH_PATTERN,
  POSTHOG_EVENTS,
  THROTTLE_TIERS,
} from "../constants/throttle-constants";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";

const MS_PER_SECOND = 1000;

/**
 * Throttler guard keyed on authenticated userId rather than IP address.
 *
 * Throttling by IP is incorrect in multi-tenant apps where many users may
 * share a NAT gateway. Since every priority endpoint is behind JwtAuthGuard,
 * the userId is always available on authenticated requests.
 *
 * Public routes (no JWT) fall back to client IP.
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

  protected async throwThrottlingException(
    context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();

    const isFeedbackRoute =
      typeof request.url === "string" &&
      (FEEDBACK_PATHS.some((feedbackPath) =>
        request.url.endsWith(feedbackPath),
      ) ||
        FEEDBACK_PATH_PATTERN.test(request.url));

    // Emit a PostHog event with diagnostic info for rate limit hits
    try {
      const userId = request.user?.userId;
      const detail = _throttlerLimitDetail as unknown as Record<
        string,
        unknown
      >;
      const requestCount =
        typeof detail.totalHits === "number" ? detail.totalHits : undefined;
      const limit = typeof detail.limit === "number" ? detail.limit : undefined;
      const rawTtl = typeof detail.ttl === "number" ? detail.ttl : undefined;

      let ttlSeconds: number | undefined;
      if (typeof rawTtl === "number") {
        ttlSeconds =
          rawTtl > MS_PER_SECOND ? Math.round(rawTtl / MS_PER_SECOND) : rawTtl;
      }

      // Tier detection: feedback routes are explicit; otherwise guess polling by URL patterns
      let tier: string = THROTTLE_TIERS.DEFAULT;
      if (isFeedbackRoute) {
        tier = THROTTLE_TIERS.FEEDBACK;
      } else if (
        typeof request.url === "string" &&
        POLLING_PATH_PATTERN.test(request.url)
      ) {
        tier = THROTTLE_TIERS.POLLING;
      }

      this.errorTracking.captureEvent(
        POSTHOG_EVENTS.RATE_LIMIT_EXCEEDED,
        userId,
        {
          endpoint: request.url,
          method: request.method,
          requestCount,
          limit,
          tier,
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
}
