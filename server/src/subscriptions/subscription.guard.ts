import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { SubscriptionsService } from "./subscriptions.service";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    const hasActiveSubscription =
      await this.subscriptionsService.hasActiveSubscription(userId);

    if (!hasActiveSubscription) {
      throw new ForbiddenException("Active subscription required");
    }

    return true;
  }
}
