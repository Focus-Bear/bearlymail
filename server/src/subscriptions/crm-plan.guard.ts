import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { SubscriptionsService } from "./subscriptions.service";

/** Machine-readable error code the client uses to show the CRM upgrade prompt. */
export const PLAN_EXCLUDES_CRM_CODE = "PLAN_EXCLUDES_CRM";

/**
 * Blocks CRM endpoints (deals, contact records, notes, custom fields) for
 * orgs whose plan does not include the CRM. Apply AFTER JwtAuthGuard so
 * request.user is populated.
 */
@Injectable()
export class CrmPlanGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    if (!(await this.subscriptionsService.hasCrmAccess(userId))) {
      throw new ForbiddenException({
        message: "Your plan does not include the CRM",
        code: PLAN_EXCLUDES_CRM_CODE,
      });
    }

    return true;
  }
}
