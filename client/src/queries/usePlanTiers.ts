import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

/**
 * A purchasable volume tier as returned by GET /subscriptions/tiers.
 * `id` is the stable tier slug (e.g. `bearlymail_starter`) — the same key the
 * billing webhook uses to activate the plan.
 */
export interface PlanTier {
  id: string;
  monthlyPriceUsd: number;
  emailsPerCycle: number;
  /** Team members (including the owner) the plan pays for. */
  seats: number;
  includesEmailTracking: boolean;
}

async function fetchPlanTiers(): Promise<PlanTier[]> {
  const response = await axios.get<PlanTier[]>(`${API_URL}/subscriptions/tiers`);
  return response.data;
}

export function usePlanTiers(enabled = true) {
  return useQuery<PlanTier[]>({
    queryKey: ['subscriptions', 'tiers'],
    queryFn: fetchPlanTiers,
    enabled,
    staleTime: Infinity,
  });
}
