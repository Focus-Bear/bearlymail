import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface InviteInfo {
  valid: boolean;
  orgName?: string;
  inviterName?: string;
  role?: string;
  email?: string;
}

async function validateInvite(token: string): Promise<InviteInfo> {
  const { data: inviteData } = await axios.get<InviteInfo>(`${API_URL}/organizations/invite/${token}`);
  return inviteData;
}

export function useValidateInvite(token: string | undefined) {
  return useQuery<InviteInfo>({
    queryKey: ['invite', 'validate', token],
    queryFn: () => validateInvite(token!),
    enabled: Boolean(token),
    retry: false,
  });
}
