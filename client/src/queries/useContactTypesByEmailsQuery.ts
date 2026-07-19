/**
 * useContactTypesByEmailsQuery — Wave 1 static endpoint
 *
 * Replaces independent callers of GET /contacts/contact-types-by-emails.
 * The query key is keyed by the sorted email list so that the same set of
 * emails always hits the same cache entry regardless of insertion order.
 *
 * Previous callers:
 *  1. InboxContactTypeBadge — module-level batch queue (BATCH_DELAY_MS)
 *  2. useContactTypeBadges — per-hook effect on `emails` change
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 1
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

import { STALE_TIME_2_MIN } from './constants';
import { contactKeys } from './queryKeys';

async function fetchContactTypesByEmails(emails: string[]): Promise<Record<string, string>> {
  const response = await axios.get<Record<string, string>>(`${API_URL}/contacts/contact-types-by-emails`, {
    params: { emails: emails.join(',') },
  });
  return response.data;
}

/**
 * Returns a map of email → contact type name for the given email list.
 * 2-minute stale time — contact type assignments change infrequently.
 *
 * Pass an empty array to disable the query (enabled: false).
 */
export function useContactTypesByEmailsQuery(emails: string[]) {
  const sorted = [...emails].sort();
  return useQuery({
    queryKey: contactKeys.typesByEmails(sorted),
    queryFn: () => fetchContactTypesByEmails(sorted),
    staleTime: STALE_TIME_2_MIN,
    enabled: sorted.length > 0,
  });
}
