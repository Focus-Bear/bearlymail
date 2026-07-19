/**
 * useInboxFilters
 *
 * Migrated /emails/connected-accounts fetch to useConnectedAccountsQuery
 * (TanStack Query). The local fetchConnectedAccounts + loadingAccounts state
 * have been replaced by the shared query cache (staleTime: 5 min).
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useConnectedAccountsQuery } from 'queries/useConnectedAccountsQuery';

import { API_URL } from 'config/api';
import { PRIORITY_BUCKET_DEFS } from 'constants/priorityBuckets';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

export interface InboxFilter {
  accountIds: string[];
  categories: string[];
  minPriority: number | null;
  maxPriority: number | null;
}

export interface ConnectedAccount {
  id: string;
  email: string;
  provider: 'gmail' | 'office365' | 'zoho' | 'apple-mail';
  isPrimary: boolean;
  isActive: boolean;
}

const STORAGE_KEY = 'inbox_filters';
const FIRST_LOAD_KEY = 'inbox_first_load_seen';
const PRIORITY_DEFAULT_FIX_KEY = 'inbox_priority_migration_v2_done';
/**
 * v3 migration key: resets users who stored old visual bucket values (80/null for VH, etc.)
 * from PR #1417 back to the correct score-based VH threshold (50/null).
 * Fix #1452: PR #1417 introduced visual 0-100 buckets that didn't match server score ranges.
 * Those bucket values (80/null, 60/80, etc.) are now invalid after this fix.
 * sanitizeStoredFilters resets them to null/null; this migration then re-applies VH.
 */
const PRIORITY_SCORE_RANGE_FIX_KEY = 'inbox_priority_migration_v3_score_ranges_done';

/** Threshold for the very high-priority tier. Shared with EmailListStates. */
export const VERY_HIGH_PRIORITY_THRESHOLD = 50;
/** Threshold for the high-priority tier. Shared with EmailListStates. */
export const HIGH_PRIORITY_THRESHOLD = 30;
/** Threshold for the medium-priority tier. Shared with EmailListStates. */
export const MEDIUM_PRIORITY_THRESHOLD = 15;
/** Threshold for the low-priority tier. Shared with EmailListStates. */
export const LOW_PRIORITY_THRESHOLD = 1;

/**
 * Priority ranges used for sanitizing stored filters.
 * Each entry is a valid (min, max) pair from the PriorityRangeSelector slider.
 * The slider snaps to multiples of 20 (0, 20, 40, 60, 80, 100); null means no bound.
 *
 * Single source of truth: derived from PRIORITY_BUCKET_DEFS in constants/priorityBuckets.ts.
 * Do not hardcode bucket boundaries here — update priorityBuckets.ts instead.
 */
export const PRIORITY_RANGES = PRIORITY_BUCKET_DEFS;

/**
 * Sanitize filters loaded from localStorage.
 *
 * Validates the stored `(minPriority, maxPriority)` pair against known PRIORITY_RANGES.
 * This handles users who stored filters before `maxPriority` was introduced (PR #1103):
 * their localStorage has `{ minPriority: 50 }` with no `maxPriority` key, which results
 * in `maxPriority: undefined` after JSON.parse. `undefined !== null` causes:
 *   - The dropdown to show "All" (no PRIORITY_RANGES entry matches min=50, max=undefined)
 *   - The badge to show "1 active filter" (minPriority !== null → counts as active)
 *
 * Fix: any unrecognised (minPriority, maxPriority) pair is reset to null/null.
 * Also normalises `undefined` → `null` for both fields.
 *
 * Fixes: #1164 (ghost active-filter badge count)
 */
function sanitizeStoredFilters(filters: InboxFilter): InboxFilter {
  const minPriority = filters.minPriority ?? null;
  const maxPriority = filters.maxPriority ?? null;

  if (minPriority === null && maxPriority === null) {
    return { ...filters, minPriority: null, maxPriority: null };
  }

  const isValidRange = PRIORITY_RANGES.some(range => range.min === minPriority && range.max === maxPriority);

  if (!isValidRange) {
    return { ...filters, minPriority: null, maxPriority: null };
  }

  return { ...filters, minPriority, maxPriority };
}

function loadInitialFilters(): InboxFilter {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // User has previously stored preferences — sanitize then return
      if (!localStorage.getItem(FIRST_LOAD_KEY)) {
        localStorage.setItem(FIRST_LOAD_KEY, '1');
      }
      const parsed = sanitizeStoredFilters(JSON.parse(stored));

      // One-time migration: users who got the broken null/null default from PR #1121
      // (fix #1119) should be reset to VERY_HIGH_PRIORITY_THRESHOLD. The #1119 workaround
      // is no longer needed because PR #1159 (fix #1155) properly fixed priorityModeActive.
      // Only resets users whose filters are still all-default (never manually changed).
      //
      // Trade-off: this condition cannot distinguish between:
      //   a) a user who got the broken null/null default and never touched their filters
      //      (the intended migration target), and
      //   b) a user who *deliberately* cleared all filters to see their full inbox.
      // Both groups are treated identically — their filters are reset to VERY_HIGH_PRIORITY_THRESHOLD
      // on next visit. This is an intentional one-time disruption: group (b) will see fewer
      // emails until they manually clear the filter again. The PRIORITY_DEFAULT_FIX_KEY flag
      // prevents this from ever recurring. Future devs: do not change this condition without
      // considering group (b) — a more granular migration would require per-user server-side
      // state that we don't have.
      if (!localStorage.getItem(PRIORITY_DEFAULT_FIX_KEY)) {
        localStorage.setItem(PRIORITY_DEFAULT_FIX_KEY, '1');
        if (
          parsed.minPriority === null &&
          parsed.maxPriority === null &&
          parsed.accountIds.length === 0 &&
          parsed.categories.length === 0
        ) {
          return { ...parsed, minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };
        }
      }

      // v3 migration: PR #1417 stored visual bucket values (e.g. minPriority: 80 for "Very High")
      // which don't match actual server score ranges. sanitizeStoredFilters above already reset
      // these invalid pairs to null/null; this migration converts null/null back to VH (50/null).
      // The migration key ensures this only fires once per user.
      if (!localStorage.getItem(PRIORITY_SCORE_RANGE_FIX_KEY)) {
        localStorage.setItem(PRIORITY_SCORE_RANGE_FIX_KEY, '1');
        if (
          parsed.minPriority === null &&
          parsed.maxPriority === null &&
          parsed.accountIds.length === 0 &&
          parsed.categories.length === 0
        ) {
          return { ...parsed, minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };
        }
      }

      return parsed;
    }
  } catch (error) {
    console.error('Failed to load filters from localStorage:', error);
  }
  // First visit (no stored filters) — default to Very High for new users.
  // Fix #1452 (bug 2): revert the PR #1435 change that defaulted new users to null/null ("All").
  // The inbox prioritisation gate (usePrioritisationGate) handles the initial analysis phase
  // separately — while analysis is running and fewer than 20 emails are prioritised, the gate
  // interstitial is shown regardless of the filter value. Once the gate lifts, the guided
  // progressive unlock flow starts from Very High as intended. Starting on null/null ("All")
  // broke the progressive unlock sequence entirely.
  localStorage.setItem(FIRST_LOAD_KEY, '1');
  return { accountIds: [], categories: [], minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };
}

export function useInboxFilters() {
  const [isFilterBarVisible, setIsFilterBarVisible] = useState(false);
  const [filters, setFilters] = useState<InboxFilter>(loadInitialFilters);

  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Connected accounts served from the shared TanStack Query cache (staleTime: 5 min)
  const { data: connectedAccounts = [], isFetching: loadingAccounts } = useConnectedAccountsQuery();

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error('Failed to save filters to localStorage:', error);
    }
  }, [filters]);

  // Fetch available categories from inbox-summary (contains id+name with stable UUIDs).
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const summaryResp = await axios.get(`${API_URL}/emails/inbox-summary?mode=triage&includeThreadIds=false`);
      const cats = summaryResp.data?.categories ?? [];
      // Each category must have a UUID id — if id is missing, that's a server-side data bug.
      // UUID-only: use category id as the filter key; "uncategorized" for items with no UUID.
      // Never use name as a key — name strings are for display only.
      setAvailableCategories(
        cats.map((cat: { id?: string; name?: string }) => ({
          id: cat.id ?? CATEGORY_KEY_UNCATEGORIZED,
          label: cat.name ?? cat.id ?? 'Uncategorized',
        }))
      );
    } catch (error) {
      console.error('Failed to fetch categories from inbox-summary:', error);
      // Do not fall back to the deprecated /emails/categories endpoint.
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  // Load categories when filter bar becomes visible (accounts load automatically via query)
  useEffect(() => {
    if (isFilterBarVisible) {
      fetchCategories();
    }
  }, [isFilterBarVisible, fetchCategories]);

  const toggleFilterBar = useCallback(() => {
    setIsFilterBarVisible(prev => !prev);
  }, []);

  const setAccountFilter = useCallback((accountIds: string[]) => {
    setFilters(prev => ({ ...prev, accountIds }));
  }, []);

  const setCategoryFilter = useCallback((categories: string[]) => {
    setFilters(prev => ({ ...prev, categories }));
  }, []);

  const setPriorityFilter = useCallback((minPriority: number | null, maxPriority: number | null = null) => {
    setFilters(prev => ({ ...prev, minPriority, maxPriority }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ accountIds: [], categories: [], minPriority: null, maxPriority: null });
  }, []);

  const resetToHighPriority = useCallback(() => {
    setFilters(prev => ({ ...prev, minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null }));
  }, []);

  const hasActiveFilters =
    filters.accountIds.length > 0 ||
    filters.categories.length > 0 ||
    filters.minPriority !== null ||
    filters.maxPriority !== null;

  return {
    isFilterBarVisible,
    filters,
    connectedAccounts,
    availableCategories,
    loadingAccounts,
    loadingCategories,
    hasActiveFilters,
    toggleFilterBar,
    setAccountFilter,
    setCategoryFilter,
    setPriorityFilter,
    clearFilters,
    resetToHighPriority,
  };
}
