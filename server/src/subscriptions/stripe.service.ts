import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

import {
  STRIPE_ENV,
  STRIPE_PRICE_ENV_BY_TIER,
} from "./stripe-billing.constants";

/** Params for opening a Stripe Hosted Checkout session for an org's plan. */
export interface CreateCheckoutParams {
  orgId: string;
  tierId: string;
  priceId: string;
  /** Existing Stripe customer to reuse, or null to create one from the email. */
  customerId: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Thin wrapper over the Stripe Node SDK for BearlyMail's direct Web Billing.
 *
 * Isolates all Stripe API calls (checkout, customer portal, webhook signature
 * verification) and the tier-slug ↔ Price-ID mapping so the rest of the
 * subscriptions layer stays provider-agnostic. When `STRIPE_SECRET_KEY` is
 * unset the service is inert — {@link isConfigured} returns false and the
 * caller falls back to the contact-us flow — so local/dev runs don't need
 * Stripe configured.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | null;
  private readonly priceIdByTier: Record<string, string> = {};
  private readonly tierByPriceId: Record<string, string> = {};

  constructor(private readonly configService: ConfigService) {
    const secretKey =
      this.configService.get<string>(STRIPE_ENV.SECRET_KEY) || null;
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret =
      this.configService.get<string>(STRIPE_ENV.WEBHOOK_SECRET) || null;

    for (const [tier, envKey] of Object.entries(STRIPE_PRICE_ENV_BY_TIER)) {
      const priceId = this.configService.get<string>(envKey);
      if (priceId) {
        this.priceIdByTier[tier] = priceId;
        this.tierByPriceId[priceId] = tier;
      }
    }

    if (!this.stripe) {
      this.logger.warn(
        `${STRIPE_ENV.SECRET_KEY} not set — Stripe checkout is disabled`,
      );
    } else {
      this.logger.log(
        `Stripe initialized (${Object.keys(this.priceIdByTier).length} tier price(s) mapped)`,
      );
    }
    if (!this.webhookSecret) {
      this.logger.warn(
        `${STRIPE_ENV.WEBHOOK_SECRET} not set — Stripe webhook verification is disabled`,
      );
    }
  }

  /** Whether Stripe is configured (secret key present). */
  isConfigured(): boolean {
    return this.stripe !== null;
  }

  /** The Stripe Price ID configured for a tier slug, or null if unmapped. */
  priceIdForTier(tierId: string): string | null {
    return this.priceIdByTier[tierId] ?? null;
  }

  /** The tier slug for a Stripe Price ID, or null if it isn't one of ours. */
  tierForPriceId(priceId: string): string | null {
    return this.tierByPriceId[priceId] ?? null;
  }

  private requireClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException("Stripe is not configured");
    }
    return this.stripe;
  }

  /**
   * Creates a Stripe Hosted Checkout session for a subscription and returns its
   * URL. The org id rides on `client_reference_id` + metadata (on both the
   * session and the resulting subscription) so the webhook can map the purchase
   * back to the org without a separate "link" round-trip.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<string> {
    const stripe = this.requireClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.orgId,
      metadata: { orgId: params.orgId, tierId: params.tierId },
      subscription_data: {
        metadata: { orgId: params.orgId, tierId: params.tierId },
      },
      allow_promotion_codes: true,
      ...(params.customerId
        ? { customer: params.customerId }
        : { customer_email: params.customerEmail }),
    });
    if (!session.url) {
      throw new ServiceUnavailableException(
        "Stripe did not return a checkout URL",
      );
    }
    return session.url;
  }

  /**
   * Creates a Stripe Billing Portal session (self-serve manage/cancel/update
   * card) for an existing customer and returns its URL.
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<string> {
    const stripe = this.requireClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  /**
   * Verifies a Stripe webhook signature over the raw request body and returns
   * the typed event. Throws if Stripe or the signing secret isn't configured,
   * or if the signature is invalid.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.requireClient();
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        "Stripe webhook secret is not configured",
      );
    }
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
