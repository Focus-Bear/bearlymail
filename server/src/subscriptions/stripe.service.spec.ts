import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { StripeService } from "./stripe.service";

/** Builds a ConfigService whose `get` reads from a plain map. */
function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const FULL_ENV = {
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  STRIPE_PRICE_STARTER: "price_starter_5",
  STRIPE_PRICE_GROWTH: "price_growth_15",
  STRIPE_PRICE_ENTERPRISE: "price_enterprise",
  // Retired Prices existing subscribers are still billed on.
  STRIPE_PRICE_STARTER_LEGACY: "price_starter_15",
  STRIPE_PRICE_GROWTH_LEGACY: "price_growth_25",
};

describe("StripeService", () => {
  describe("configuration", () => {
    it("is configured when the secret key is present", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.isConfigured()).toBe(true);
    });

    it("is inert when the secret key is absent", () => {
      const service = new StripeService(configWith({}));
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe("tier <-> price mapping", () => {
    it("checks out each tier on its current Price, never a retired one", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.priceIdForTier("bearlymail_starter")).toBe(
        "price_starter_5",
      );
      expect(service.priceIdForTier("bearlymail_growth")).toBe(
        "price_growth_15",
      );
      expect(service.priceIdForTier("bearlymail_enterprise")).toBe(
        "price_enterprise",
      );
    });

    it("maps a current price id back to its tier slug", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.tierForPriceId("price_growth_15")).toBe(
        "bearlymail_growth",
      );
      expect(service.isLegacyPrice("price_growth_15")).toBe(false);
    });

    it("still maps retired prices to their tier so existing subscribers keep working", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.tierForPriceId("price_starter_15")).toBe(
        "bearlymail_starter",
      );
      expect(service.tierForPriceId("price_growth_25")).toBe(
        "bearlymail_growth",
      );
      expect(service.isLegacyPrice("price_starter_15")).toBe(true);
      expect(service.isLegacyPrice("price_growth_25")).toBe(true);
    });

    it("treats a price configured as both current and retired as current", () => {
      const service = new StripeService(
        configWith({
          ...FULL_ENV,
          STRIPE_PRICE_STARTER: "price_same",
          STRIPE_PRICE_STARTER_LEGACY: "price_same",
        }),
      );
      expect(service.priceIdForTier("bearlymail_starter")).toBe("price_same");
      expect(service.isLegacyPrice("price_same")).toBe(false);
    });

    it("does not offer a retired price at checkout when the new one is unset", () => {
      const service = new StripeService(
        configWith({
          STRIPE_SECRET_KEY: "sk_test_dummy",
          STRIPE_PRICE_STARTER_LEGACY: "price_starter_15",
        }),
      );
      expect(service.priceIdForTier("bearlymail_starter")).toBeNull();
      expect(service.tierForPriceId("price_starter_15")).toBe(
        "bearlymail_starter",
      );
    });

    it("returns null for an unknown tier or price", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.priceIdForTier("nope")).toBeNull();
      expect(service.tierForPriceId("price_unknown")).toBeNull();
    });

    it("omits tiers whose price env var is unset", () => {
      const service = new StripeService(
        configWith({ STRIPE_SECRET_KEY: "sk_test_dummy" }),
      );
      expect(service.priceIdForTier("bearlymail_starter")).toBeNull();
    });
  });

  describe("guards when not fully configured", () => {
    it("throws when creating checkout without a secret key", async () => {
      const service = new StripeService(configWith({}));
      await expect(
        service.createCheckoutSession({
          orgId: "o1",
          tierId: "bearlymail_starter",
          priceId: "price_starter",
          customerId: null,
          customerEmail: "a@b.com",
          successUrl: "https://x/s",
          cancelUrl: "https://x/c",
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("throws when verifying a webhook without a signing secret", () => {
      const service = new StripeService(
        configWith({ STRIPE_SECRET_KEY: "sk_test_dummy" }),
      );
      expect(() =>
        service.constructWebhookEvent(Buffer.from("{}"), "sig"),
      ).toThrow(ServiceUnavailableException);
    });
  });
  describe("getRecurringRevenue", () => {
    const item = (
      unitAmount: number | null,
      interval: string,
      overrides: { currency?: string; quantity?: number } = {},
    ) => ({
      quantity: overrides.quantity ?? 1,
      price: {
        currency: overrides.currency ?? "usd",
        unit_amount: unitAmount,
        recurring: { interval, interval_count: 1 },
      },
    });

    /** Swaps in a fake client whose list() yields the given subscriptions. */
    function withSubscriptions(subscriptions: unknown[]): {
      service: StripeService;
      list: jest.Mock;
    } {
      const service = new StripeService(configWith(FULL_ENV));
      const list = jest.fn(async function* () {
        yield* subscriptions;
      });
      (service as unknown as { stripe: unknown }).stripe = {
        subscriptions: { list },
      };
      return { service, list };
    }

    it("returns null when Stripe is not configured", async () => {
      const service = new StripeService(configWith({}));
      await expect(service.getRecurringRevenue()).resolves.toBeNull();
    });

    it("normalises yearly prices and quantities to monthly USD", async () => {
      const { service, list } = withSubscriptions([
        { items: { data: [item(1500, "month")] } },
        { items: { data: [item(12000, "year", { quantity: 2 })] } },
      ]);
      const revenue = await service.getRecurringRevenue();
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
      expect(revenue?.mrrUsd).toBeCloseTo(15 + 20, 6);
      expect(revenue?.payingSubscriptionCount).toBe(2);
      expect(revenue?.excludedItemCount).toBe(0);
    });

    it("counts non-USD and unpriced items instead of guessing their value", async () => {
      const { service } = withSubscriptions([
        {
          items: {
            data: [
              item(500, "month"),
              item(900, "month", { currency: "eur" }),
              item(null, "month"),
            ],
          },
        },
      ]);
      const revenue = await service.getRecurringRevenue();
      expect(revenue?.mrrUsd).toBeCloseTo(5, 6);
      expect(revenue?.excludedItemCount).toBe(2);
    });
  });
});
