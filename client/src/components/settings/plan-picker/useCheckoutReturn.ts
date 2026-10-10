import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { VolumeUsage } from 'queries/useOrgUsage';

import {
  ACTIVATION_POLL_INTERVAL_MS,
  ACTIVATION_POLL_TIMEOUT_MS,
} from 'components/settings/plan-picker/planPicker.constants';
import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';

const CHECKOUT_QUERY_PARAM = 'checkout';
const CHECKOUT_SUCCESS = 'success';
const PLAN_STATUS_ACTIVE = 'active';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Strips the `?checkout=...` param so a refresh/back doesn't re-trigger. */
function stripCheckoutParam(): void {
  const params = new URLSearchParams(window.location.search);
  params.delete(CHECKOUT_QUERY_PARAM);
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', next);
}

/**
 * Handles the return from Stripe Hosted Checkout. When the browser comes back
 * to the settings page with `?checkout=success`, polls `/organizations/usage`
 * until the Stripe webhook flips the org plan to active, then shows a success
 * toast and refreshes org data. `?checkout=cancelled` just clears the param.
 * Runs once per mount (guarded), independent of the plan-picker modal.
 */
export function useCheckoutReturn(): void {
  const { t } = useTranslation();
  const { showSuccess } = useNotifications();
  const queryClient = useQueryClient();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) {
      return;
    }
    const status = new URLSearchParams(window.location.search).get(CHECKOUT_QUERY_PARAM);
    if (!status) {
      return;
    }
    handledRef.current = true;
    stripCheckoutParam();
    if (status !== CHECKOUT_SUCCESS) {
      return;
    }

    let cancelled = false;
    const poll = async (): Promise<void> => {
      const deadline = Date.now() + ACTIVATION_POLL_TIMEOUT_MS;
      for (;;) {
        if (cancelled) {
          return;
        }
        try {
          const { data: usage } = await axios.get<VolumeUsage>(`${API_URL}/organizations/usage`);
          if (usage.planStatus === PLAN_STATUS_ACTIVE) {
            await queryClient.invalidateQueries({ queryKey: ['organization'] });
            showSuccess(t('team.settings.planPicker.purchaseSuccessToast'));
            return;
          }
        } catch {
          // Transient polling failure — the next tick retries.
        }
        if (Date.now() + ACTIVATION_POLL_INTERVAL_MS > deadline) {
          return;
        }
        await sleep(ACTIVATION_POLL_INTERVAL_MS);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [queryClient, showSuccess, t]);
}
