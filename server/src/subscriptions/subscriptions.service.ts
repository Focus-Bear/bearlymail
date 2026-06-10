import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { SUBSCRIPTION_STATUS } from "../constants/domain-statuses";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MEMBER_STATUS } from "../constants/member-roles";
import { TOKEN_CONSTANTS } from "../constants/service-constants";
import { DAYS, MILLISECONDS } from "../constants/time-constants";
import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { decryptUserEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ApiError } from "../types/common";
import { sanitizeAxiosError } from "../utils/axios-error.utils";
import { VOLUME_TIER_NONE, VOLUME_TIERS } from "./volume-tiers.constants";

export { VOLUME_TIER_NONE, VOLUME_TIERS };

/** Threshold (as a percentage) at which a warning is emitted for email volume usage. */
export const EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT = 80;

/**
 * RevenueCat webhook event payload structure
 * See: https://www.revenuecat.com/docs/webhooks
 */
export interface RevenueCatWebhookPayload {
  event: {
    app_user_id: string;
    product_id?: string;
    // Entitlement identifiers granted by this event. The product_id is a store
    // SKU (e.g. a Stripe `prod_...` id) and is NOT stable across platforms, so
    // volume tiers are keyed off entitlements instead. `entitlement_id` is the
    // deprecated singular form RevenueCat still sends on some events.
    entitlement_ids?: string[];
    entitlement_id?: string;
    type?: string;
    // Additional event properties that vary by event type
    [key: string]: unknown;
  };
  // Additional webhook properties
  [key: string]: unknown;
}

type RevenueCatEvent = RevenueCatWebhookPayload["event"];

/** Normalises the event's entitlement identifiers (array or deprecated singular). */
function getEventEntitlementIds(event: RevenueCatEvent): string[] {
  if (Array.isArray(event.entitlement_ids)) return event.entitlement_ids;
  return typeof event.entitlement_id === "string" ? [event.entitlement_id] : [];
}

/** Returns the volume-tier entitlement granted by the event, if any. */
function getVolumeTierFromEvent(event: RevenueCatEvent): string | undefined {
  return getEventEntitlementIds(event).find((id) => id in VOLUME_TIERS);
}

/**
 * An event is org-level when it grants a volume-tier entitlement or is a
 * per-seat product. Everything is volume-based and every user is an org-of-one,
 * so volume purchases always route through the org handler.
 */
function isOrgEvent(event: RevenueCatEvent): boolean {
  const productId = event.product_id;
  if (productId?.startsWith("bearlymail_seat")) return true;
  return getVolumeTierFromEvent(event) !== undefined;
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
  private readonly projectId: string | null = null;
  // RevenueCat REST API v2 base URL
  private readonly baseUrl = "https://api.revenuecat.com/v2";

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
    this.projectId =
      this.configService.get<string>("REVENUECAT_PROJECT_ID") || null;
    if (this.apiKey && this.projectId) {
      this.logger.log("RevenueCat API initialized");
    } else if (this.apiKey && !this.projectId) {
      this.logger.warn(
        "REVENUECAT_PROJECT_ID not set — RevenueCat API reads (v2) are disabled; " +
          "webhooks still process from their payload",
      );
    } else {
      this.logger.warn(
        "REVENUECAT_API_KEY not found, RevenueCat API reads disabled",
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
   * Fetches a customer's active entitlements via the RevenueCat REST API v2:
   *   GET /projects/{projectId}/customers/{id}/active_entitlements
   *
   * Returns a normalised, still-active list. `expires_at` may arrive as either
   * an epoch-ms number or an ISO 8601 string depending on the RC API version,
   * so both are accepted; `null` means no expiry. Returns [] when the API
   * isn't configured (apiKey/projectId) so callers transparently fall back to
   * the webhook-maintained DB status.
   * Requires only the `customer_information:customers:read` v2 permission.
   */
  private async getActiveEntitlements(
    customerId: string,
  ): Promise<{ entitlementId: string; expiresAt: Date | null }[]> {
    if (!this.apiKey || !this.projectId) return [];
    const responseBody = await this.makeRevenueCatRequest(
      `/projects/${this.projectId}/customers/${encodeURIComponent(
        customerId,
      )}/active_entitlements`,
    );
    const items: Array<{
      entitlement_id?: string;
      expires_at?: string | number | null;
    }> = responseBody?.items ?? [];
    const now = Date.now();
    return items
      .filter((item) => {
        if (!item.entitlement_id) return false;
        if (item.expires_at == null) return true;
        const expiresTime =
          typeof item.expires_at === "number"
            ? item.expires_at
            : new Date(item.expires_at).getTime();
        return !isNaN(expiresTime) && expiresTime > now;
      })
      .map((item) => ({
        entitlementId: item.entitlement_id as string,
        expiresAt: item.expires_at != null ? new Date(item.expires_at) : null,
      }));
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
      user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE ||
      user.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL
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
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
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
        user.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL ||
        user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE
      ) {
        await this.userRepository.update(userId, {
          subscriptionStatus: SUBSCRIPTION_STATUS.EXPIRED,
        });
        return { status: SUBSCRIPTION_STATUS.EXPIRED, isActive: false };
      }
    }

    // Sync from RevenueCat (v2 active entitlements) if the user is linked.
    // Any active entitlement → active access; the local "trial" state is owned
    // by startTrial(), not RevenueCat.
    if (user.revenueCatUserId && this.apiKey && this.projectId) {
      try {
        const active = await this.getActiveEntitlements(user.revenueCatUserId);
        if (active.length > 0) {
          const expiresAt = active[0].expiresAt ?? undefined;
          await this.userRepository.update(userId, {
            subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
            subscriptionExpiresAt: expiresAt,
            revenueCatUserId: user.revenueCatUserId,
          });

          return {
            status: SUBSCRIPTION_STATUS.ACTIVE,
            expiresAt,
            isActive: true,
          };
        }
        // RC successfully returned zero active entitlements. If the DB still
        // says ACTIVE (e.g. an EXPIRATION/CANCELLATION webhook was missed),
        // demote to EXPIRED so the user doesn't retain paid access on the
        // strength of a stale local flag.
        if (user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
          await this.userRepository.update(userId, {
            subscriptionStatus: SUBSCRIPTION_STATUS.EXPIRED,
          });
          return {
            status: SUBSCRIPTION_STATUS.EXPIRED,
            isActive: false,
          };
        }
      } catch (error) {
        this.logger.error(
          `Failed to check RevenueCat subscription for user ${userId}: ${sanitizeAxiosError(error)}`,
        );
      }
    }

    // Fall back to database status
    const isActive =
      user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE ||
      (user.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL &&
        user.subscriptionExpiresAt &&
        user.subscriptionExpiresAt > new Date());

    return {
      status: user.subscriptionStatus || SUBSCRIPTION_STATUS.EXPIRED,
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
    // Webhook processing does not require the API key: org/volume events are
    // resolved entirely from the payload, and the individual path degrades
    // gracefully when the API isn't configured. Authenticity is enforced by the
    // signature check in the controller.
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

      // Route org-level events (volume-tier entitlements or seat products)
      // separately. The tier is decided by entitlement, not by the store-level
      // product_id (which is a Stripe SKU).
      if (isOrgEvent(event)) {
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
          try {
            const active = await this.getActiveEntitlements(app_user_id);
            if (active.length > 0) {
              await this.userRepository.update(user.id, {
                subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
                subscriptionExpiresAt: active[0].expiresAt ?? undefined,
                revenueCatUserId: app_user_id,
              });
            }
          } catch (error) {
            this.logger.error(
              `Failed to fetch customer info for ${app_user_id}: ${sanitizeAxiosError(error)}`,
            );
          }
          break;

        case "CANCELLATION":
          await this.userRepository.update(user.id, {
            subscriptionStatus: SUBSCRIPTION_STATUS.CANCELLED,
          });
          break;

        case "EXPIRATION":
          await this.userRepository.update(user.id, {
            subscriptionStatus: SUBSCRIPTION_STATUS.EXPIRED,
          });
          break;
      }

      this.logger.log(
        `Processed RevenueCat webhook: ${event.type} for user ${user.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing RevenueCat webhook: ${sanitizeAxiosError(error)}`,
      );
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
        user.subscriptionStatus === SUBSCRIPTION_STATUS.EXPIRED
          ? SUBSCRIPTION_STATUS.TRIAL
          : user.subscriptionStatus || SUBSCRIPTION_STATUS.TRIAL,
    });

    this.logger.log(
      `Extended trial/subscription for user ${userId} by ${days} days. New expiration: ${newExpiresAt}`,
    );
    return { success: true, newExpiresAt };
  }

  /**
   * Get all users with subscription info (admin only), paginated.
   */
  async getAllUsersWithSubscriptions(
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      name: string;
      subscriptionStatus: string;
      subscriptionExpiresAt: Date | null;
      trialStartedAt: Date | null;
      createdAt: Date;
      needsRelogin: boolean;
      lastLogoutReason: string | null;
      lastLogoutAt: Date | null;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const [rawUsers, total] = await this.userRepository.findAndCount({
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        trialStartedAt: true,
        createdAt: true,
        needsRelogin: true,
        lastLogoutReason: true,
        lastLogoutAt: true,
      },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const mappedUsers = rawUsers.map((user) => {
      decryptUserEntityForApi(user);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionStatus: user.subscriptionStatus || "none",
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        trialStartedAt: user.trialStartedAt,
        createdAt: user.createdAt,
        needsRelogin: user.needsRelogin === true,
        lastLogoutReason: user.lastLogoutReason ?? null,
        lastLogoutAt: user.lastLogoutAt ?? null,
      };
    });

    return {
      users: mappedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
      subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
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
      subscriptionStatus: SUBSCRIPTION_STATUS.EXPIRED,
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
   * Updates Organization.maxSeats and volume tier. The volume tier is decided
   * by the granted entitlement (a stable slug), not the store product_id.
   */
  private async handleOrgSubscriptionEvent(
    event: RevenueCatWebhookPayload["event"],
  ): Promise<void> {
    const appUserId = event.app_user_id;
    const productId = event.product_id as string | undefined;
    const tierEntitlement = getVolumeTierFromEvent(event);

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
      } else if (tierEntitlement) {
        org.volumeTierProductId = tierEntitlement;
        org.emailVolumeLimit = VOLUME_TIERS[tierEntitlement].limit;
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
      `Org ${org.id} updated from RC event ${eventType} (tier: ${tierEntitlement ?? productId ?? "none"})`,
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
        where: { organizationId: org.id, status: MEMBER_STATUS.ACTIVE },
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
        where: { organizationId: org.id, status: MEMBER_STATUS.ACTIVE },
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
   * Resolves the user's active org and records one processed email against it.
   * Returns null when the user has no active org membership (no metering /
   * gating applies — fail open). Under the org-of-one model every user has a
   * personal org, so this normally resolves; null is the safe fallback for any
   * user not yet backfilled.
   */
  async trackEmailForUser(
    userId: string,
  ): Promise<{ allowed: boolean; percentUsed: number } | null> {
    const membership = await this.memberRepository.findOne({
      where: { userId, status: MEMBER_STATUS.ACTIVE },
    });
    if (!membership) return null;
    return this.trackEmailProcessed(membership.organizationId);
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
      subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
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
