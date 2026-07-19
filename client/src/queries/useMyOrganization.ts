import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

const HTTP_NOT_FOUND = 404;

export interface OrgMember {
  id: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'deactivated';
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type OrgPlanStatus = 'unpaid' | 'trial' | 'active' | 'expired';

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  members: OrgMember[];
  planStatus: OrgPlanStatus;
  trialEndsAt: string | null;
  /** True on self-hosted deployments — plan limits and usage are not enforced. */
  selfHosted?: boolean;
}

async function fetchMyOrganization(): Promise<Organization | null> {
  try {
    const response = await axios.get<Organization>(`${API_URL}/organizations/me`);
    return response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === HTTP_NOT_FOUND) {
      return null;
    }
    throw err;
  }
}

export function useMyOrganization() {
  return useQuery<Organization | null>({
    queryKey: ['organization', 'me'],
    queryFn: fetchMyOrganization,
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation<OrgMember, Error, { email: string; role: 'admin' | 'member' }>({
    mutationFn: async dto => {
      const response = await axios.post<OrgMember>(`${API_URL}/organizations/invite`, dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'me'] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation<OrgMember, Error, { memberId: string; role: 'admin' | 'member' }>({
    mutationFn: async ({ memberId, role }) => {
      const response = await axios.patch<OrgMember>(`${API_URL}/organizations/members/${memberId}`, { role });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'me'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async memberId => {
      await axios.delete(`${API_URL}/organizations/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'me'] });
    },
  });
}
