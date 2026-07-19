import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";

import { SubscriptionsService } from "./subscriptions.service";

/** Machine-readable error code the client uses to detect AI-capacity 402s. */
export const AI_VOLUME_LIMIT_REACHED_CODE = "AI_VOLUME_LIMIT_REACHED";

/**
 * Blocks on-demand AI endpoints once the user's org has exhausted its email
 * volume limit for the billing cycle (free tier after trial expiry, or the
 * paid tier's cap). Non-incrementing: it only checks capacity, it never
 * records usage. Apply AFTER JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class AiCapacityGuard implements CanActivate {
  private readonly logger = new Logger(AiCapacityGuard.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    const { allowed, percentUsed } =
      await this.subscriptionsService.checkAiCapacity(userId);

    if (!allowed) {
      this.logger.warn(
        `Blocking AI request for user ${userId}: ${percentUsed}% of plan email volume used`,
      );
      throw new HttpException(
        {
          message: "AI usage limit reached for your plan",
          code: AI_VOLUME_LIMIT_REACHED_CODE,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
