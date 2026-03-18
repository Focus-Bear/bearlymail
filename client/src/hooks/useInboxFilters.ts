import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface InboxFilter {
  accountIds: string[];
  categories: string[];
  minPriority: number | null;
  maxPriority: number | null;
}

export interface ConnectedAccount {
  id: string;
  email: string;
  provider: 'gmail' | 'office365' | 'zoho';
  isPrimary: boolean;
  isActive: boolean;
}

const STORAGE_KEY = 'inbox_filters';
const FIRST_LOAD_KEY = 'inbox_first_load_seen';

/** Threshold for the high-priority tier. Shared with EmailListStates. */
export const HIGH_PRIORITY_THRESHOLD = 50;
/** Threshold for the medium-priority tier. Shared with EmailListStates. */
export const MEDIUM_PRIORITY_THRESHOLD = 20;
/** Threshold for the low-priority tier. Shared with EmailListStates. */
export const LOW_PRIORITY_THRESHOLD = 1;

// Priority ranges — each entry carries both min and max to support bounded range filtering.
// max: null means "no upper bound" (i.e., score >= min with no ceiling).
// min: null means "no lower bound" (i.e., score <= max with no floor).
export const PRIORITY_RANGES = [
  { label: 'All', min: null, max: null },
  { label: 'Very Low', min: null, max: 0, displayValue: '< 0' },
  { label: 'Low', min: 0, max: 15, displayValue: '0-15' },
  { label: 'Medium', min: 15, max: 30, displayValue: '15-30' },
  { label: 'High', min: 30, max: 50, displayValue: '30-50' },
  { label: 'Very High', min: 50, max: null, displayValue: '> 50' },
] as const;

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

  const isValidRange = PRIORITY_RANGES.some(
    range => range.min === minPriority && range.max === maxPriority
  );

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
      return sanitizeStoredFilters(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to load filters from localStorage:', error);
  }
  // First visit (no stored filters) — default to no priority filter so triage
  // shows all unstarred threads (fix #1119: HIGH_PRIORITY_THRESHOLD caused
  // priorityModeActive=true which silently dropped the starCount=0 guard).
  localStorage.setItem(FIRST_LOAD_KEY, '1');
  return { accountIds: [], categories: [], minPriority: null, maxPriority: null };
}

export function useInboxFilters() {
  const [isFilterBarVisible, setIsFilterBarVisible] = useState(false);
  const [filters, setFilters] = useState<InboxFilter>(loadInitialFilters);

  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error('Failed to save filters to localStorage:', error);
    }
  }, [filters]);

  // Fetch connected accounts
  const fetchConnectedAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const response = await axios.get<ConnectedAccount[]>(`${API_URL}/emails/connected-accounts`);
      setConnectedAccounts(response.data);
    } catch (error) {
      console.error('Failed to fetch connected accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Fetch available categories from inbox-summary (contains id+name with stable UUIDs).
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const summaryResp = await axios.get(`${API_URL}/emails/inbox-summary?mode=triage&includeThreadIds=false`);
      const cats = summaryResp.data?.categories ?? [];
      // Each category must have a UUID id — if id is missing, that's a server-side data bug.
      setAvailableCategories(cats.map((cat: { id?: string; name?: string }) => ({ id: cat.id ?? cat.name, label: cat.name ?? cat.id })));
    } catch (error) {
      console.error('Failed to fetch categories from inbox-summary:', error);
      // Do not fall back to the deprecated /emails/categories endpoint.
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  // Load accounts and categories when filter bar becomes visible
  useEffect(() => {
    if (isFilterBarVisible) {
      fetchConnectedAccounts();
      fetchCategories();
    }
  }, [isFilterBarVisible, fetchConnectedAccounts, fetchCategories]);

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
    filters.accountIds.length > 0 || filters.categories.length > 0 || filters.minPriority !== null || filters.maxPriority !== null;

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
