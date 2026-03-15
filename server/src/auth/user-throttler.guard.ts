import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ThrottlerGuard, ThrottlerLimitDetail } from "@nestjs/throttler";

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
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    return user?.userId ?? String(req.ip ?? "unknown");
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<{ url?: string }>();
    const feedbackPaths = ["/priority/star-feedback"];
    const isFeedbackRoute =
      typeof request.url === "string" &&
      (feedbackPaths.some((feedbackPath) => request.url!.endsWith(feedbackPath)) ||
        /\/priority\/[^/]+\/feedback/.test(request.url));

    const message = isFeedbackRoute
      ? "Too many feedback submissions. Please wait before submitting again."
      : "Too many requests. Please slow down.";

    throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
