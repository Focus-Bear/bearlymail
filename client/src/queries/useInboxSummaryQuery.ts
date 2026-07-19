/**
 * useInboxSummaryQuery — Wave 2: inbox summary endpoint
 *
 * Replaces the manual stale-while-revalidate pattern in useEmailFetching:
 *  - serveSummaryFromCacheAndRefresh — dispatches localStorage cache, fires
 *    a silent background fetch with no error handling
 *  - fetchInboxSummary — raw axios call that dispatches 10+ Redux actions
 *
 * TanStack Query's placeholderData: keepPreviousData provides the same
 * stale-while-revalidate UX without any manual Redux dispatching.
 *
 * The `includeThreadIds` param is optional — some callers (useInboxFilters)
 * only need the category list and pass false to reduce payload size.
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 2
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { STALE_TIME_1_MIN } from './constants';
import { emailKeys } from './queryKeys';

export interface InboxSummaryResponse {
  categories: CategorySummaryItem[];
}

interface FetchSummaryParams {
  mode: string;
  includeThreadIds?: boolean;
  accountIds?: string[];
  categories?: string[];
  minPriority?: number | null;
  maxPriority?: number | null;
}

async function fetchInboxSummaryAPI(params: FetchSummaryParams): Promise<InboxSummaryResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('mode', params.mode);
  if (params.includeThreadIds !== undefined) {
    searchParams.set('includeThreadIds', String(params.includeThreadIds));
  }
  if (params.accountIds?.length) {
    searchParams.set('accountIds', params.accountIds.join(','));
  }
  if (params.categories?.length) {
    searchParams.set('categories', params.categories.join(','));
  }
  if (params.minPriority !== null && params.minPriority !== undefined) {
    searchParams.set('minPriority', String(params.minPriority));
  }
  if (params.maxPriority !== null && params.maxPriority !== undefined) {
    searchParams.set('maxPriority', String(params.maxPriority));
  }

  const response = await axios.get<InboxSummaryResponse>(`${API_URL}/emails/inbox-summary?${searchParams.toString()}`);
  return response.data;
}

/**
 * Returns the inbox summary (category list with counts) for a given mode.
 *
 * - staleTime: 60s — matches the old INBOX_CACHE_TTL_MS
 * - placeholderData: keepPreviousData — shows previous data while refetching
 *   (replaces the serveSummaryFromCacheAndRefresh stale-while-revalidate pattern)
 *
 * Pass `enabled: false` to suspend the query (e.g. when the user is not logged in).
 */
export function useInboxSummaryQuery(params: FetchSummaryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: emailKeys.summary(params.mode),
    queryFn: () => fetchInboxSummaryAPI(params),
    staleTime: STALE_TIME_1_MIN, // 60s — matches INBOX_CACHE_TTL_MS
    placeholderData: keepPreviousData,
    enabled: options?.enabled !== false,
  });
}
