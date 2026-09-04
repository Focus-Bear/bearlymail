import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Request,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request as ExpressRequest } from "express";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MEMBER_ROLES } from "../constants/member-roles";
import { OrganizationsService } from "../organizations/organizations.service";
import {
  AdminGrantPlanDto,
  AdminPlanTargetDto,
  ApplyPromoDto,
  CreateCheckoutDto,
  GrantAccessDto,
  LinkOrgRevenueCatDto,
} from "./dto/subscriptions.dto";
import { StripeService } from "./stripe.service";
import {
  RevenueCatWebhookPayload,
  SubscriptionsService,
} from "./subscriptions.service";

const ADMIN_USERS_DEFAULT_PAGE_LIMIT = 50;

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly organizationsService: OrganizationsService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Resolves the caller's org, requiring owner/admin role — the gate for all
   * billing actions (checkout, portal).
   */
  private async requireOrgBillingAccess(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findActiveMembership(userId);
    if (!membership) {
      throw new ForbiddenException("You are not a member of any organisation");
    }
    if (
      membership.role !== MEMBER_ROLES.OWNER &&
      membership.role !== MEMBER_ROLES.ADMIN
    ) {
      throw new ForbiddenException(
        "Only org owners and admins can manage billing",
      );
    }
    return membership.organizationId;
  }

  /**
   * Start a Stripe Hosted Checkout for the caller's org to buy a volume tier.
   * Returns the URL the client redirects to. Owner/admin only.
   * POST /subscriptions/checkout
   */
  @Post("checkout")
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Request() req, @Body() body: CreateCheckoutDto) {
    const orgId = await this.requireOrgBillingAccess(req.user.userId);
    return this.subscriptionsService.createOrgCheckout(orgId, body.tierId);
  }

  /**
   * Open the Stripe Billing Portal for the caller's org (manage/cancel/update
   * card). Returns the portal URL. Owner/admin only.
   * POST /subscriptions/portal
   */
  @Post("portal")
  @UseGuards(JwtAuthGuard)
  async createBillingPortal(@Request() req) {
    const orgId = await this.requireOrgBillingAccess(req.user.userId);
    return this.subscriptionsService.createOrgBillingPortal(orgId);
  }

  /**
   * Stripe webhook — verifies the signature over the RAW request body, then
   * applies subscription-lifecycle changes. No JWT guard; authenticity comes
   * from the Stripe-Signature HMAC.
   * POST /subscriptions/stripe/webhook
   */
  @Post("stripe/webhook")
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<ExpressRequest>,
    @Headers("stripe-signature") signature: string | undefined,
  ) {
    if (!signature || !req.rawBody) {
      throw new BadRequestException("Missing Stripe signature or body");
    }
    let event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch {
      // Signature mismatch / tampered payload — reject without leaking details.
      throw new BadRequestException("Invalid Stripe webhook signature");
    }
    await this.subscriptionsService.handleStripeWebhook(event);
    return { received: true };
  }

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

  /**
   * List the purchasable volume tiers (id = RevenueCat entitlement slug,
   * price and email allowance) so the client can render the plan picker
   * without hardcoding pricing.
   * GET /subscriptions/tiers
   */
  @Get("tiers")
  @UseGuards(JwtAuthGuard)
  getTiers() {
    return this.subscriptionsService.getVolumeTierList();
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
  async getAllUsers(
    @Request() _req,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.subscriptionsService.getAllUsersWithSubscriptions(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : ADMIN_USERS_DEFAULT_PAGE_LIMIT,
    );
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
    if (
      membership.role !== MEMBER_ROLES.OWNER &&
      membership.role !== MEMBER_ROLES.ADMIN
    ) {
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

  /**
   * Grant a complimentary org volume-tier plan to a user (admin only).
   * Refuses with 409 when the org's billing is live in RevenueCat.
   * POST /subscriptions/admin/grant-plan
   */
  @Post("admin/grant-plan")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminGrantPlan(@Request() req, @Body() body: AdminGrantPlanDto) {
    return this.subscriptionsService.adminGrantPlan(
      req.user.userId,
      body.userId,
      body.tier,
    );
  }

  /**
   * Revoke a complimentary org plan — the org drops to the free tier (admin only).
   * POST /subscriptions/admin/revoke-plan
   */
  @Post("admin/revoke-plan")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminRevokePlan(@Request() req, @Body() body: AdminPlanTargetDto) {
    return this.subscriptionsService.adminRevokePlan(
      req.user.userId,
      body.userId,
    );
  }

  /**
   * Reset an org's email-usage counter and restart its billing cycle (admin only).
   * POST /subscriptions/admin/reset-usage
   */
  @Post("admin/reset-usage")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminResetUsage(@Request() req, @Body() body: AdminPlanTargetDto) {
    return this.subscriptionsService.adminResetUsage(
      req.user.userId,
      body.userId,
    );
  }
}
