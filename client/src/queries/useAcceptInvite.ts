import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

async function acceptInvite(token: string): Promise<void> {
  await axios.post(`${API_URL}/organizations/invite/${token}/accept`);
}

export function useAcceptInvite() {
  return useMutation<void, Error, string>({
    mutationFn: acceptInvite,
  });
}
