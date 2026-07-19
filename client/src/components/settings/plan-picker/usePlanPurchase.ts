import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorCode, type Offerings, type Package, Purchases, PurchasesError } from '@revenuecat/purchases-js';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { VolumeUsage } from 'queries/useOrgUsage';

import {
  ACTIVATION_POLL_INTERVAL_MS,
  ACTIVATION_POLL_TIMEOUT_MS,
} from 'components/settings/plan-picker/planPicker.constants';
import { API_URL } from 'config/api';
import { getRevenueCatApiKey } from 'config/revenuecat';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

export type PurchasePhase = 'idle' | 'purchasing' | 'activating' | 'success' | 'timeout';

export const PHASE_IDLE: PurchasePhase = 'idle';
export const PHASE_PURCHASING: PurchasePhase = 'purchasing';
export const PHASE_ACTIVATING: PurchasePhase = 'activating';
export const PHASE_SUCCESS: PurchasePhase = 'success';
export const PHASE_TIMEOUT: PurchasePhase = 'timeout';

const PLAN_STATUS_ACTIVE = 'active';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Finds the Web Billing package for a volume tier. Dashboard products (or
 * custom package identifiers) must use the tier's entitlement slug
 * (e.g. `bearlymail_starter`) as their identifier for this lookup to work.
 */
export function findPackageForTier(offerings: Offerings, tierId: string): Package | null {
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      if (pkg.webBillingProduct?.identifier === tierId || pkg.identifier === tierId) {
        return pkg;
      }
    }
  }
  return null;
}

function isUserCancelled(error: unknown): boolean {
  return error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError;
}

async function getConfiguredPurchases(apiKey: string, appUserId: string): Promise<Purchases> {
  if (Purchases.isConfigured()) {
    const instance = Purchases.getSharedInstance();
    if (instance.getAppUserId() !== appUserId) {
      await instance.changeUser(appUserId);
    }
    return instance;
  }
  return Purchases.configure({ apiKey, appUserId });
}

/** Polls org usage until the webhook flips the plan to active (or times out). */
async function pollUntilPlanActive(signal: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + ACTIVATION_POLL_TIMEOUT_MS;
  for (;;) {
    if (signal.aborted) {
      return false;
    }
    try {
      const response = await axios.get<VolumeUsage>(`${API_URL}/organizations/usage`, { signal });
      if (response.data.planStatus === PLAN_STATUS_ACTIVE) {
        return true;
      }
    } catch {
      // Transient polling failures are fine — the next tick retries.
      if (signal.aborted) {
        return false;
      }
    }
    if (Date.now() + ACTIVATION_POLL_INTERVAL_MS > deadline) {
      return false;
    }
    await sleep(ACTIVATION_POLL_INTERVAL_MS);
  }
}

/**
 * Drives the in-app plan purchase: links the user to RevenueCat, opens the
 * Web Billing checkout for the chosen tier, then polls until the server
 * webhook activates the org plan. Cancellation is silent; errors surface as
 * a toast; a slow webhook resolves to the friendly 'timeout' phase.
 */
export function usePlanPurchase() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotifications();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PurchasePhase>('idle');
  const [purchasingTierId, setPurchasingTierId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any in-flight linking request or activation polling.
      abortRef.current?.abort();
    };
  }, []);

  const safeSetPhase = useCallback((next: PurchasePhase) => {
    if (mountedRef.current) {
      setPhase(next);
    }
  }, []);

  const startPurchase = useCallback(
    async (tierId: string) => {
      const apiKey = getRevenueCatApiKey();
      if (!apiKey || !user || phase === PHASE_PURCHASING || phase === PHASE_ACTIVATING) {
        return;
      }
      setPurchasingTierId(tierId);
      safeSetPhase(PHASE_PURCHASING);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // Link first so the webhook can resolve the purchase back to this user's org.
        await axios.post(
          `${API_URL}/subscriptions/link-revenuecat`,
          { revenueCatUserId: user.id },
          { signal: controller.signal },
        );
        const purchases = await getConfiguredPurchases(apiKey, user.id);
        const offerings = await purchases.getOfferings();
        const rcPackage = findPackageForTier(offerings, tierId);
        if (!rcPackage) {
          showError(t('team.settings.planPicker.planUnavailable'));
          safeSetPhase(PHASE_IDLE);
          return;
        }
        await purchases.purchase({ rcPackage, customerEmail: user.email });
        safeSetPhase(PHASE_ACTIVATING);
        const activated = await pollUntilPlanActive(controller.signal);
        await queryClient.invalidateQueries({ queryKey: ['organization'] });
        if (activated) {
          showSuccess(t('team.settings.planPicker.purchaseSuccessToast'));
          safeSetPhase(PHASE_SUCCESS);
        } else {
          safeSetPhase(PHASE_TIMEOUT);
        }
      } catch (error: unknown) {
        if (!isUserCancelled(error)) {
          showError(t('team.settings.planPicker.purchaseError'));
        }
        safeSetPhase(PHASE_IDLE);
      } finally {
        if (mountedRef.current) {
          setPurchasingTierId(null);
        }
      }
    },
    [phase, queryClient, safeSetPhase, showError, showSuccess, t, user],
  );

  return { phase, purchasingTierId, startPurchase };
}
