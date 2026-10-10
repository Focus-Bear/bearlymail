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
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_GROWTH: "price_growth",
  STRIPE_PRICE_ENTERPRISE: "price_enterprise",
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
    it("maps each tier slug to its configured Stripe price id", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.priceIdForTier("bearlymail_starter")).toBe(
        "price_starter",
      );
      expect(service.priceIdForTier("bearlymail_growth")).toBe("price_growth");
      expect(service.priceIdForTier("bearlymail_enterprise")).toBe(
        "price_enterprise",
      );
    });

    it("maps a price id back to its tier slug", () => {
      const service = new StripeService(configWith(FULL_ENV));
      expect(service.tierForPriceId("price_growth")).toBe("bearlymail_growth");
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
});
