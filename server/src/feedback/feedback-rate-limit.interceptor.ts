/**
 * Simple in-memory rate limiter for POST /feedback endpoints.
 *
 * Limits each authenticated user to FEEDBACK_MAX_PER_HOUR submissions per
 * sliding hour window.  Keyed on userId (falls back to IP for unauthenticated
 * requests).  Uses an in-memory Map so it resets on restart — adequate for the
 * current single-instance deployment; replace with Redis when moving to
 * multi-instance.
 *
 * When PR #920 (UserThrottlerGuard / @nestjs/throttler) is merged, this
 * interceptor should be removed and the @Throttle({ feedback: {} }) decorator
 * used instead.  See: https://github.com/Focus-Bear/BearlyMail/issues/912
 */

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { MILLISECONDS } from "../constants/time-constants";

/** Maximum feedback submissions per user per sliding hour. */
const FEEDBACK_MAX_PER_HOUR = 10;
/** Sliding window duration in milliseconds (1 hour). */
const WINDOW_MS = MILLISECONDS.HOUR;

@Injectable()
export class FeedbackRateLimitInterceptor implements NestInterceptor {
  /** Map<userId | ip, timestamps of submissions within the current window> */
  private readonly timestamps = new Map<string, number[]>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const key: string =
      (request.user?.userId as string | undefined) ??
      (request.ip as string) ??
      "unknown";

    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Prune timestamps outside the sliding window.
    const prev = (this.timestamps.get(key) ?? []).filter(
      (ts) => ts > windowStart,
    );

    if (prev.length >= FEEDBACK_MAX_PER_HOUR) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Feedback submission limit reached (${FEEDBACK_MAX_PER_HOUR} per hour). Please try again later.`,
          error: "Too Many Requests",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    prev.push(now);
    this.timestamps.set(key, prev);

    return next.handle();
  }
}
