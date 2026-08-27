import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { useNotifications } from 'contexts/NotificationContext';

export type PurchasePhase = 'idle' | 'redirecting';

export const PHASE_IDLE: PurchasePhase = 'idle';
export const PHASE_REDIRECTING: PurchasePhase = 'redirecting';

interface CheckoutResponse {
  url: string;
}

/**
 * Drives the plan purchase via Stripe Hosted Checkout. Asks the server for a
 * Checkout Session URL for the chosen tier and redirects the browser to it —
 * Stripe hosts the payment page (3DS, wallets, tax) and returns the user to the
 * settings page, where {@link useCheckoutReturn} polls for the webhook to
 * activate the plan. No client-side Stripe/Elements code, so the deferred
 * `client_secret` confirm flow that plagued the RevenueCat integration is gone.
 */
export function usePlanPurchase() {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const [phase, setPhase] = useState<PurchasePhase>(PHASE_IDLE);
  const [purchasingTierId, setPurchasingTierId] = useState<string | null>(null);

  const startPurchase = useCallback(
    async (tierId: string) => {
      if (phase === PHASE_REDIRECTING) {
        return;
      }
      setPurchasingTierId(tierId);
      setPhase(PHASE_REDIRECTING);
      try {
        const { data: checkout } = await axios.post<CheckoutResponse>(`${API_URL}/subscriptions/checkout`, {
          tierId,
        });
        captureEvent(ANALYTICS_EVENTS.PLAN_CHECKOUT_STARTED, { tierId });
        // Full-page redirect to Stripe's hosted checkout.
        window.location.assign(checkout.url);
      } catch (error: unknown) {
        const errorCode = error instanceof Error ? error.name : 'UnknownError';
        captureEvent(ANALYTICS_EVENTS.PLAN_PURCHASE_FAILED, { tierId, errorCode });
        showError(t('team.settings.planPicker.purchaseError'));
        setPhase(PHASE_IDLE);
        setPurchasingTierId(null);
      }
    },
    [phase, showError, t],
  );

  return { phase, purchasingTierId, startPurchase };
}
