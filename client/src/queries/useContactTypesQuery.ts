/**
 * useContactTypesQuery — Wave 1 static endpoint
 *
 * Replaces 5 independent callers of GET /contacts/types that previously caused
 * 15+ duplicate requests on inbox load (the "thundering herd" described in #1224).
 *
 * TanStack Query deduplicates concurrent calls that share the same queryKey,
 * so all components that call this hook within the same render cycle share a
 * single in-flight request. Subsequent calls within the 5-minute staleTime
 * are served from cache without hitting the network.
 *
 * Previous callers replaced by this hook:
 *  1. InboxContactTypeBadge — module-level loadConfigs() with partial dedup
 *  2. useContactTypeBadges — per-instance ref guard
 *  3. useContactsData — no dedup
 *  4. hooks/useContactDetailData — no dedup
 *  5. pages/contact-detail/hooks/useContactDetailData — duplicate file, no dedup
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 1
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ContactTypeConfig } from 'types/contact';

import { API_URL } from 'config/api';

import { STALE_TIME_5_MIN } from './constants';
import { contactKeys } from './queryKeys';

async function fetchContactTypes(): Promise<ContactTypeConfig[]> {
  const response = await axios.get<ContactTypeConfig[]>(`${API_URL}/contacts/types`);
  return response.data;
}

/**
 * Returns contact type configurations with a 5-minute stale time.
 * Configs change only when an admin edits them — near-static data.
 */
export function useContactTypesQuery() {
  return useQuery({
    queryKey: contactKeys.types,
    queryFn: fetchContactTypes,
    staleTime: STALE_TIME_5_MIN,
  });
}
