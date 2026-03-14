import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface InboxFilter {
  accountIds: string[];
  categories: string[];
  minPriority: number | null;
}

export interface ConnectedAccount {
  id: string;
  email: string;
  provider: 'gmail' | 'office365' | 'zoho';
  isPrimary: boolean;
  isActive: boolean;
}

const STORAGE_KEY = 'inbox_filters';
const DEFAULT_MIN_PRIORITY = 50;

// Priority ranges as specified in the issue
export const PRIORITY_RANGES = [
  { label: 'All', value: null },
  { label: 'Very Low', value: -Infinity, displayValue: '< 0' },
  { label: 'Low', value: 0, displayValue: '0-15' },
  { label: 'Medium', value: 15, displayValue: '15-30' },
  { label: 'High', value: 30, displayValue: '30-50' },
  { label: 'Very High', value: 50, displayValue: '> 50' },
] as const;

export function useInboxFilters() {
  const [isFilterBarVisible, setIsFilterBarVisible] = useState(false);
  const [filters, setFilters] = useState<InboxFilter>(() => {
    // Load filters from localStorage on init
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load filters from localStorage:', error);
    }
    // Default: high priority for new users — progressive unlock from there
    return {
      accountIds: [],
      categories: [],
      minPriority: DEFAULT_MIN_PRIORITY,
    };
  });

  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
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

  // Fetch available categories
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const response = await axios.get<string[]>(`${API_URL}/emails/categories`);
      setAvailableCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
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

  const setPriorityFilter = useCallback((minPriority: number | null) => {
    setFilters(prev => ({ ...prev, minPriority }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      accountIds: [],
      categories: [],
      minPriority: null,
    });
  }, []);

  const hasActiveFilters =
    filters.accountIds.length > 0 || filters.categories.length > 0 || filters.minPriority !== null;

  return {
    // State
    isFilterBarVisible,
    filters,
    connectedAccounts,
    availableCategories,
    loadingAccounts,
    loadingCategories,
    hasActiveFilters,

    // Actions
    toggleFilterBar,
    setAccountFilter,
    setCategoryFilter,
    setPriorityFilter,
    clearFilters,
  };
}
