import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrganizationsService } from "../organizations/organizations.service";
import {
  ApplyPromoDto,
  GrantAccessDto,
  LinkOrgRevenueCatDto,
} from "./dto/subscriptions.dto";
import {
  RevenueCatWebhookPayload,
  SubscriptionsService,
} from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post("start-trial")
  @UseGuards(JwtAuthGuard)
  async startTrial(@Request() req) {
    return this.subscriptionsService.startTrial(req.user.userId);
  }

  @Get("status")
  @UseGuards(JwtAuthGuard)
  async getStatus(@Request() req) {
    return this.subscriptionsService.checkSubscriptionStatus(req.user.userId);
  }

  @Post("webhook")
  async handleWebhook(
    @Headers("authorization") authorizationHeader: string | undefined,
    @Body() payload: RevenueCatWebhookPayload,
  ) {
    if (
      !this.subscriptionsService.verifyWebhookSignature(authorizationHeader)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    await this.subscriptionsService.handleWebhook(payload);
    return { received: true };
  }

  @Post("link-revenuecat")
  @UseGuards(JwtAuthGuard)
  async linkRevenueCat(
    @Request() req,
    @Body() body: { revenueCatUserId: string },
  ) {
    await this.subscriptionsService.linkRevenueCatUser(
      req.user.userId,
      body.revenueCatUserId,
    );
    return { success: true };
  }

  @Post("extend-trial")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async extendTrial(
    @Request() req,
    @Body() body: { userId: string; days: number },
  ) {
    return this.subscriptionsService.extendTrial(body.userId, body.days);
  }

  @Get("all-users")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllUsers(@Request() _req) {
    return this.subscriptionsService.getAllUsersWithSubscriptions();
  }

  /**
   * Apply a RevenueCat promo code for the current user.
   * POST /subscriptions/apply-promo
   */
  @Post("apply-promo")
  @UseGuards(JwtAuthGuard)
  async applyPromo(@Request() req, @Body() body: ApplyPromoDto) {
    return this.subscriptionsService.applyPromoCode(
      req.user.userId,
      body.promoCode,
    );
  }

  /**
   * Link the current user's org to a RevenueCat org subscription.
   * Only org owner or admin may call this.
   * POST /subscriptions/org/link-revenuecat
   */
  @Post("org/link-revenuecat")
  @UseGuards(JwtAuthGuard)
  async linkOrgRevenueCat(@Request() req, @Body() body: LinkOrgRevenueCatDto) {
    const membership = await this.organizationsService.findActiveMembership(
      req.user.userId,
    );
    if (!membership) {
      throw new ForbiddenException("You are not a member of any organisation");
    }
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ForbiddenException(
        "Only org owners and admins can link billing",
      );
    }
    await this.subscriptionsService.linkOrgRevenueCat(
      membership.organizationId,
      body.revenueCatOrgSubscriptionId,
    );
    return { success: true };
  }

  /**
   * Grant complimentary access to a user (admin only).
   * POST /subscriptions/grant-access
   */
  @Post("grant-access")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async grantAccess(@Request() _req, @Body() body: GrantAccessDto) {
    return this.subscriptionsService.grantComplimentaryAccess(
      body.userId,
      body.durationDays,
    );
  }
}
