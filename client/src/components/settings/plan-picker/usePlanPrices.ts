import { useQuery } from '@tanstack/react-query';

import { getConfiguredPurchases } from 'components/settings/plan-picker/usePlanPurchase';
import { getRevenueCatApiKey } from 'config/revenuecat';
import { useAuth } from 'contexts/AuthContext';

/**
 * Live per-tier formatted prices from the RevenueCat offering (e.g. "$15.00"),
 * keyed by the tier/entitlement slug (`bearlymail_starter`, …). Preferred over
 * the server's hard-coded fallback so prices track the RevenueCat/Stripe
 * dashboard without a redeploy. Resolves to an empty map (caller falls back to
 * the server price) when the Web Billing key is unset or offerings can't load.
 */
async function fetchPlanPrices(apiKey: string, appUserId: string): Promise<Record<string, string>> {
  const purchases = await getConfiguredPurchases(apiKey, appUserId);
  const offerings = await purchases.getOfferings();
  const prices: Record<string, string> = {};
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      const slug = pkg.webBillingProduct?.identifier ?? pkg.identifier;
      const formatted = pkg.webBillingProduct?.price?.formattedPrice;
      if (slug && formatted) {
        prices[slug] = formatted;
      }
    }
  }
  return prices;
}

export function usePlanPrices(enabled = true) {
  const { user } = useAuth();
  const apiKey = getRevenueCatApiKey();
  const appUserId = user?.id;
  return useQuery<Record<string, string>>({
    queryKey: ['subscriptions', 'plan-prices', appUserId],
    queryFn: () => fetchPlanPrices(apiKey as string, appUserId as string),
    enabled: enabled && Boolean(apiKey) && Boolean(appUserId),
    staleTime: Infinity,
  });
}
