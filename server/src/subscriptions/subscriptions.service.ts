import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { sanitizeAxiosError } from "../utils/axios-error.utils";
import { TOKEN_CONSTANTS } from "../constants/service-constants";
import { DAYS, MILLISECONDS } from "../constants/time-constants";
import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { ApiError } from "../types/common";
import { VOLUME_TIER_NONE, VOLUME_TIERS } from "./volume-tiers.constants";

export { VOLUME_TIER_NONE, VOLUME_TIERS };

/** Threshold (as a percentage) at which a warning is emitted for email volume usage. */
export const EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT = 80;

function isOrgProduct(productId: string | undefined): boolean {
  if (!productId) return false;
  return productId.startsWith("bearlymail_seat") || productId in VOLUME_TIERS;
}

/**
 * RevenueCat webhook event payload structure
 * See: https://www.revenuecat.com/docs/webhooks
 */
export interface RevenueCatWebhookPayload {
  event: {
    app_user_id: string;
    product_id?: string;
    type?: string;
    // Additional event properties that vary by event type
    [key: string]: unknown;
  };
  // Additional webhook properties
  [key: string]: unknown;
}

/**
 * Generic request data for RevenueCat API calls
 */
interface RevenueCatRequestData {
  [key: string]: unknown;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly apiKey: string | null = null;
  private readonly webhookSecret: string | null = null;
  // RevenueCat API base URL
  private readonly baseUrl = "https://api.revenuecat.com/v1";

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private orgRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private memberRepository: Repository<OrganizationMember>,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>("REVENUECAT_API_KEY") || null;
    this.webhookSecret =
      this.configService.get<string>("REVENUECAT_WEBHOOK_SECRET") || null;
    if (this.apiKey) {
      this.logger.log("RevenueCat API initialized");
    } else {
      this.logger.warn(
        "REVENUECAT_API_KEY not found, RevenueCat features disabled",
      );
    }
    if (!this.webhookSecret) {
      this.logger.warn(
        "REVENUECAT_WEBHOOK_SECRET not configured — webhook signature verification is disabled",
      );
    }
  }

  /**
   * Verifies the RevenueCat webhook Authorization header.
   * RevenueCat sends the secret as a plain Bearer token in the Authorization header.
   * Returns true if verification is disabled (no secret configured), or if the header matches.
   * See: https://www.revenuecat.com/docs/integrations/webhooks/authentication
   */
  verifyWebhookSignature(authorizationHeader: string | undefined): boolean {
    if (!this.webhookSecret) {
      // Secret not configured — fail open with a warning (already logged at startup).
      return true;
    }
    if (!authorizationHeader) {
      return false;
    }
    const expected = `Bearer ${this.webhookSecret}`;
    // Constant-time comparison to prevent timing attacks
    if (authorizationHeader.length !== expected.length) {
      return false;
    }
    let mismatch = 0;
    for (let idx = 0; idx < authorizationHeader.length; idx++) {
      mismatch |=
        authorizationHeader.charCodeAt(idx) ^ expected.charCodeAt(idx);
    }
    return mismatch === 0;
  }

  private async makeRevenueCatRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    requestData?: RevenueCatRequestData,
  ) {
    if (!this.apiKey) {
      throw new Error("RevenueCat API key not configured");
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response =
        method === "POST"
          ? await axios.post(url, requestData, { headers })
          : await axios.get(url, { headers });
      return response.data;
    } catch (error: unknown) {
      const isErr = error instanceof Error;
      const errorMessage = isErr ? error.message : "Unknown error";
      const responseData = (error as ApiError).response?.data;
      this.logger.error(`RevenueCat API error: ${errorMessage}`, responseData);
      throw error;
    }
  }

  /**
   * Start a 7-day free trial for a user
   */
  async startTrial(
    userId: string,
  ): Promise<{ success: boolean; expiresAt?: Date }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Check if user already has an active subscription
    if (
      user.subscriptionStatus === "active" ||
      user.subscriptionStatus === "trial"
    ) {
      return { success: false };
    }

    // Start 7-day trial
    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(
      trialEndDate.getDate() + TOKEN_CONSTANTS.TRIAL_PERIOD_DAYS,
    );

    await this.userRepository.update(userId, {
      subscriptionStatus: "trial",
      trialStartedAt: trialStartDate,
      subscriptionExpiresAt: trialEndDate,
    });

    this.logger.log(`Started 7-day trial for user ${userId}`);
    return { success: true, expiresAt: trialEndDate };
  }

  /**
   * Check subscription status and update user record
   */
  async checkSubscriptionStatus(userId: string): Promise<{
    status: string;
    expiresAt?: Date;
    isActive: boolean;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Check if subscription has expired
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date()) {
      if (
        user.subscriptionStatus === "trial" ||
        user.subscriptionStatus === "active"
      ) {
        await this.userRepository.update(userId, {
          subscriptionStatus: "expired",
        });
        return { status: "expired", isActive: false };
      }
    }

    // Check RevenueCat if user has a RevenueCat ID
    if (user.revenueCatUserId && this.apiKey) {
      try {
        const customerInfo = await this.makeRevenueCatRequest(
          `/subscribers/${user.revenueCatUserId}`,
        );
        const activeEntitlements = customerInfo.subscriber?.entitlements || {};
        const activeEntitlementKeys = Object.keys(activeEntitlements).filter(
          (key) =>
            activeEntitlements[key]?.expires_date === null ||
            new Date(activeEntitlements[key].expires_date) > new Date(),
        );

        // Check if user has active entitlement
        if (activeEntitlementKeys.length > 0) {
          // User has active subscription via RevenueCat
          const firstEntitlement = activeEntitlements[activeEntitlementKeys[0]];
          const status = firstEntitlement?.will_renew ? "active" : "trial";
          const expiresAt = firstEntitlement?.expires_date
            ? new Date(firstEntitlement.expires_date)
            : undefined;

          await this.userRepository.update(userId, {
            subscriptionStatus: status,
            subscriptionExpiresAt: expiresAt,
            revenueCatUserId: user.revenueCatUserId,
          });

          return { status, expiresAt, isActive: true };
        }
      } catch (error) {
        this.logger.error(
          `Failed to check RevenueCat subscription for user ${userId}: ${sanitizeAxiosError(error)}`,
        );
      }
    }

    // Fall back to database status
    const isActive =
      user.subscriptionStatus === "active" ||
      (user.subscriptionStatus === "trial" &&
        user.subscriptionExpiresAt &&
        user.subscriptionExpiresAt > new Date());

    return {
      status: user.subscriptionStatus || "expired",
      expiresAt: user.subscriptionExpiresAt,
      isActive,
    };
  }

  /**
   * Verify if user has active subscription (for middleware/guards)
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const status = await this.checkSubscriptionStatus(userId);
    return status.isActive;
  }

  /**
   * Handle webhook from RevenueCat
   */
  async handleWebhook(payload: RevenueCatWebhookPayload): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn("RevenueCat not initialized, ignoring webhook");
      return;
    }

    try {
      const { event } = payload;
      const { app_user_id } = event;

      // Find user by RevenueCat ID
      const user = await this.userRepository.findOne({
        where: { revenueCatUserId: app_user_id },
      });

      if (!user) {
        this.logger.warn(`User not found for RevenueCat ID: ${app_user_id}`);
        return;
      }

      const productId = event.product_id as string | undefined;

      // Route org-level product events separately
      if (isOrgProduct(productId)) {
        await this.handleOrgSubscriptionEvent(event);
        this.logger.log(
          `Processed org RevenueCat webhook: ${event.type} for user ${user.id}`,
        );
        return;
      }

      // Update subscription status based on event type (individual users)
      switch (event.type) {
        case "INITIAL_PURCHASE":
        case "RENEWAL":
        case "PRODUCT_CHANGE":
          if (this.apiKey) {
            try {
              const customerInfo = await this.makeRevenueCatRequest(
                `/subscribers/${app_user_id}`,
              );
              const activeEntitlements =
                customerInfo.subscriber?.entitlements || {};
              const activeEntitlementKeys = Object.keys(
                activeEntitlements,
              ).filter(
                (key) =>
                  activeEntitlements[key]?.expires_date === null ||
                  new Date(activeEntitlements[key].expires_date) > new Date(),
              );

              if (activeEntitlementKeys.length > 0) {
                const firstEntitlement =
                  activeEntitlements[activeEntitlementKeys[0]];
                const expiresAt = firstEntitlement?.expires_date
                  ? new Date(firstEntitlement.expires_date)
                  : undefined;

                await this.userRepository.update(user.id, {
                  subscriptionStatus: "active",
                  subscriptionExpiresAt: expiresAt,
                  revenueCatUserId: app_user_id,
                });
              }
            } catch (error) {
              this.logger.error(
                `Failed to fetch customer info for ${app_user_id}: ${sanitizeAxiosError(error)}`,
              );
            }
          }
          break;

        case "CANCELLATION":
          await this.userRepository.update(user.id, {
            subscriptionStatus: "cancelled",
          });
          break;

        case "EXPIRATION":
          await this.userRepository.update(user.id, {
            subscriptionStatus: "expired",
          });
          break;
      }

      this.logger.log(
        `Processed RevenueCat webhook: ${event.type} for user ${user.id}`,
      );
    } catch (error) {
      this.logger.error(`Error processing RevenueCat webhook: ${sanitizeAxiosError(error)}`);
      throw error;
    }
  }

  /**
   * Link RevenueCat user ID to our user
   */
  async linkRevenueCatUser(
    userId: string,
    revenueCatUserId: string,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      revenueCatUserId,
    });
    this.logger.log(
      `Linked RevenueCat user ${revenueCatUserId} to user ${userId}`,
    );
  }

  /**
   * Extend trial or subscription by a specified number of days (admin only)
   */
  async extendTrial(
    userId: string,
    days: number,
  ): Promise<{ success: boolean; newExpiresAt?: Date }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Calculate new expiration date
    const now = new Date();
    const currentExpiresAt = user.subscriptionExpiresAt || now;
    const baseDate = currentExpiresAt > now ? currentExpiresAt : now;
    const newExpiresAt = new Date(baseDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + days);

    // Update user subscription
    await this.userRepository.update(userId, {
      subscriptionExpiresAt: newExpiresAt,
      subscriptionStatus:
        user.subscriptionStatus === "expired"
          ? "trial"
          : user.subscriptionStatus || "trial",
    });

    this.logger.log(
      `Extended trial/subscription for user ${userId} by ${days} days. New expiration: ${newExpiresAt}`,
    );
    return { success: true, newExpiresAt };
  }

  /**
   * Get all users with subscription info (admin only)
   */
  async getAllUsersWithSubscriptions(): Promise<
    Array<{
      id: string;
      email: string;
      name: string;
      subscriptionStatus: string;
      subscriptionExpiresAt: Date | null;
      trialStartedAt: Date | null;
      createdAt: Date;
    }>
  > {
    const users = await this.userRepository.find({
      select: [
        "id",
        "email",
        "name",
        "subscriptionStatus",
        "subscriptionExpiresAt",
        "trialStartedAt",
        "createdAt",
      ],
      order: { createdAt: "DESC" },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus || "none",
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      trialStartedAt: user.trialStartedAt,
      createdAt: user.createdAt,
    }));
  }

  // ─── Team seat management ─────────────────────────────────────────────────────

  /**
   * Activates a team seat for a user.
   * Sets subscriptionStatus=active with expiry synced to the org's billing period.
   */
  async activateTeamSeat(userId: string, orgId: string): Promise<void> {
    const org = await this.orgRepository.findOne({ where: { id: orgId } });
    if (!org) {
      this.logger.warn(`activateTeamSeat: org ${orgId} not found`);
      return;
    }

    let expiresAt: Date | undefined;
    if (org.billingCycleStart) {
      const computed = new Date(
        org.billingCycleStart.getTime() + DAYS.MONTH * MILLISECONDS.DAY,
      );
      // Guard against stale billing cycles: if the computed expiry is already in
      // the past, fall back to 30 days from now so the seat isn't immediately expired.
      expiresAt =
        computed > new Date()
          ? computed
          : new Date(Date.now() + DAYS.MONTH * MILLISECONDS.DAY);
    }

    await this.userRepository.update(userId, {
      subscriptionStatus: "active",
      ...(expiresAt ? { subscriptionExpiresAt: expiresAt } : {}),
    });
    this.logger.log(`Team seat activated for user ${userId} in org ${orgId}`);
  }

  /**
   * Deactivates a team seat for a user.
   * Reverts to expired unless user has their own RevenueCat subscription.
   */
  async deactivateTeamSeat(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    if (user.revenueCatUserId && this.apiKey) {
      try {
        const status = await this.checkSubscriptionStatus(userId);
        if (status.isActive) {
          this.logger.log(
            `User ${userId} has own subscription — not deactivating`,
          );
          return;
        }
      } catch {
        // Fall through to deactivation
      }
    }

    await this.userRepository.update(userId, {
      subscriptionStatus: "expired",
    });
    this.logger.log(`Team seat deactivated for user ${userId}`);
  }

  /**
   * Looks up the Organisation record for a given RevenueCat app_user_id.
   * First tries owner-based lookup, then falls back to the stored RC subscription ID.
   * Returns null if no org is found.
   */
  private async findOrgForRcUser(
    appUserId: string,
  ): Promise<Organization | null> {
    const owner = await this.userRepository.findOne({
      where: { revenueCatUserId: appUserId },
    });

    if (owner) {
      const ownerOrg = await this.orgRepository.findOne({
        where: { ownerId: owner.id },
      });
      if (ownerOrg) return ownerOrg;
    }

    return this.orgRepository.findOne({
      where: { revenueCatOrgSubscriptionId: appUserId },
    });
  }

  /**
   * Handles org-level RevenueCat webhook events.
   * Updates Organization.maxSeats and volume tier based on product.
   */
  private async handleOrgSubscriptionEvent(
    event: RevenueCatWebhookPayload["event"],
  ): Promise<void> {
    const appUserId = event.app_user_id;
    const productId = event.product_id as string | undefined;

    const org = await this.findOrgForRcUser(appUserId);

    if (!org) {
      this.logger.warn(
        `handleOrgSubscriptionEvent: no org found for RC user ${appUserId}`,
      );
      return;
    }

    const eventType = event.type as string;
    const seatQty = (event["quantity"] as number) ?? 1;

    if (eventType === "INITIAL_PURCHASE" || eventType === "PRODUCT_CHANGE") {
      if (productId && productId.startsWith("bearlymail_seat")) {
        org.maxSeats = seatQty;
        org.revenueCatOrgSubscriptionId = appUserId;
      } else if (productId && productId in VOLUME_TIERS) {
        org.volumeTierProductId = productId;
        org.emailVolumeLimit = VOLUME_TIERS[productId].limit;
      }
      org.billingCycleStart = new Date();
    } else if (eventType === "RENEWAL") {
      org.emailsUsedThisCycle = 0;
      org.billingCycleStart = new Date();
    } else if (eventType === "CANCELLATION" || eventType === "EXPIRATION") {
      org.maxSeats = 0;
      org.volumeTierProductId = null;
      org.emailVolumeLimit = 0;
    }

    await this.orgRepository.save(org);
    this.logger.log(
      `Org ${org.id} updated from RC event ${eventType} (product: ${productId ?? "none"})`,
    );

    await this.syncOrgSeatSubscriptions(org, eventType);
  }

  /**
   * Activates or deactivates all team member subscriptions for an org
   * based on a billing event type. Extracted to keep handleOrgSubscriptionEvent
   * under the statement-count limit.
   */
  private async syncOrgSeatSubscriptions(
    org: Organization,
    eventType: string,
  ): Promise<void> {
    if (eventType === "INITIAL_PURCHASE" || eventType === "RENEWAL") {
      const members = await this.memberRepository.find({
        where: { organizationId: org.id, status: "active" },
      });
      await Promise.all(
        members
          .filter((member) => member.userId)
          .map((member) => this.activateTeamSeat(member.userId!, org.id)),
      );
      return;
    }

    if (eventType === "CANCELLATION" || eventType === "EXPIRATION") {
      const members = await this.memberRepository.find({
        where: { organizationId: org.id, status: "active" },
      });
      await Promise.all(
        members
          .filter((member) => member.userId)
          .map((member) => this.deactivateTeamSeat(member.userId!)),
      );
      this.logger.log(
        `Deactivated ${members.length} team seat(s) for org ${org.id} due to ${eventType}`,
      );
    }
  }

  /**
   * Tracks an email processed for an org member.
   * Returns { allowed: boolean, percentUsed: number }.
   */
  async trackEmailProcessed(
    orgId: string,
  ): Promise<{ allowed: boolean; percentUsed: number }> {
    // Use atomic increment to avoid read-modify-write race conditions under concurrency.
    await this.orgRepository.increment({ id: orgId }, "emailsUsedThisCycle", 1);

    const org = await this.orgRepository.findOne({ where: { id: orgId } });
    if (!org) return { allowed: true, percentUsed: 0 };

    const percentUsed =
      org.emailVolumeLimit > 0
        ? Math.round((org.emailsUsedThisCycle / org.emailVolumeLimit) * 100)
        : 0;

    if (percentUsed >= EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT) {
      this.logger.warn(
        `Org ${orgId} at ${percentUsed}% email volume (${org.emailsUsedThisCycle}/${org.emailVolumeLimit})`,
      );
    }

    const allowed = org.emailsUsedThisCycle <= org.emailVolumeLimit;
    return { allowed, percentUsed };
  }

  /**
   * Grants complimentary access to a user via RevenueCat promotional entitlement.
   * Also updates local subscriptionStatus for immediate effect.
   */
  async grantComplimentaryAccess(
    userId: string,
    durationDays: number,
  ): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    await this.userRepository.update(userId, {
      subscriptionStatus: "active",
      subscriptionExpiresAt: expiresAt,
    });

    // RevenueCat promotional entitlement grant is not yet wired up —
    // local DB update above is the source of truth until product IDs are configured.
    // TODO(#1836): call RevenueCat /subscribers/:id/entitlements/:id/promotional
    //              with correct entitlement identifier once product IDs are known.
    if (user.revenueCatUserId && this.apiKey) {
      this.logger.warn(
        `RevenueCat promotional entitlement not implemented — local status updated for ${userId}`,
      );
    }

    this.logger.log(
      `Granted ${durationDays}-day complimentary access to user ${userId}`,
    );
    return { success: true };
  }

  /**
   * Applies a RevenueCat promo code for a user.
   * Validates via RevenueCat API and syncs subscription status.
   */
  async applyPromoCode(
    userId: string,
    _promoCode: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);

    if (!this.apiKey) {
      return { success: false, message: "Billing provider not configured" };
    }

    // TODO(#1836): The RevenueCat promo code endpoint (/subscribers/:id/promotionals)
    // is not a valid RevenueCat REST API endpoint. This needs to be implemented
    // against the correct API contract once product IDs and entitlement identifiers
    // are configured. For now, surface a clear not-implemented response.
    this.logger.warn(
      `applyPromoCode called for user ${userId} but RevenueCat promo endpoint is not yet implemented`,
    );
    return {
      success: false,
      message: "Promo code redemption is not yet available",
    };
  }

  /**
   * Links an org to a RevenueCat org subscription.
   * Only callable by org owner or admin.
   */
  async linkOrgRevenueCat(
    orgId: string,
    revenueCatOrgSubscriptionId: string,
  ): Promise<void> {
    await this.orgRepository.update(orgId, { revenueCatOrgSubscriptionId });
    this.logger.log(
      `Linked org ${orgId} to RevenueCat subscription ${revenueCatOrgSubscriptionId}`,
    );
  }
}
