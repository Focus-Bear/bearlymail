/**
 * useConnectedAccountsQuery — Wave 1 static endpoint
 *
 * Replaces 2 independent callers of GET /emails/connected-accounts:
 *  1. useInboxFilters — fetches accounts for the filter dropdown
 *  2. useSearch — fetches accounts for the search filter
 *
 * Account list changes only on connect/disconnect events, so 5-minute
 * stale time is appropriate.
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 1
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';
import { ConnectedAccount } from 'hooks/useInboxFilters';

import { STALE_TIME_5_MIN } from './constants';
import { settingsKeys } from './queryKeys';

async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const response = await axios.get<ConnectedAccount[]>(`${API_URL}/emails/connected-accounts`);
  return response.data;
}

/**
 * Returns the list of connected email accounts.
 * 5-minute stale time — only changes on connect/disconnect.
 */
export function useConnectedAccountsQuery() {
  return useQuery({
    queryKey: settingsKeys.connectedAccounts,
    queryFn: fetchConnectedAccounts,
    staleTime: STALE_TIME_5_MIN,
  });
}
