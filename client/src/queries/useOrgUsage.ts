import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { OrgPlanStatus } from 'queries/useMyOrganization';

import { API_URL } from 'config/api';

export interface SeatUsage {
  activeSeats: number;
  maxSeats: number;
  canInvite: boolean;
}

export interface VolumeUsage {
  emailsUsed: number;
  emailLimit: number;
  percentUsed: number;
  tier: string;
  planStatus: OrgPlanStatus;
  trialEndsAt: string | null;
  /** True on self-hosted deployments — plan limits and usage are not enforced. */
  selfHosted?: boolean;
}

async function fetchSeatUsage(): Promise<SeatUsage> {
  const response = await axios.get<SeatUsage>(`${API_URL}/organizations/seats`);
  return response.data;
}

async function fetchVolumeUsage(): Promise<VolumeUsage> {
  const response = await axios.get<VolumeUsage>(`${API_URL}/organizations/usage`);
  return response.data;
}

async function applyPromoCode(promoCode: string): Promise<{ success: boolean; message: string }> {
  const response = await axios.post<{ success: boolean; message: string }>(`${API_URL}/subscriptions/apply-promo`, {
    promoCode,
  });
  return response.data;
}

export function useSeatUsage() {
  return useQuery<SeatUsage>({
    queryKey: ['organization', 'seats'],
    queryFn: fetchSeatUsage,
  });
}

export function useVolumeUsage() {
  return useQuery<VolumeUsage>({
    queryKey: ['organization', 'usage'],
    queryFn: fetchVolumeUsage,
  });
}

export function useApplyPromoCode() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; message: string }, Error, string>({
    mutationFn: applyPromoCode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'usage'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'seats'] });
    },
  });
}
