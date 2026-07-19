/**
 * RevenueCat Web Billing public API key (an `rcb_...` key from the RevenueCat
 * dashboard's Web Billing app). When unset, the in-app purchase flow is
 * disabled and the plan picker falls back to a "contact us" CTA, so the UI
 * stays shippable before the RevenueCat dashboard is configured.
 * Set VITE_REVENUECAT_API_KEY at build time to enable in-app checkout.
 */
export function getRevenueCatApiKey(): string | null {
  const key = import.meta.env.VITE_REVENUECAT_API_KEY;
  if (typeof key === 'string' && key.trim() !== '') {
    return key.trim();
  }
  return null;
}
