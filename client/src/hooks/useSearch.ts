import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { SEARCH_RESULT_NO_RESULTS } from 'constants/strings';

interface ConnectedAccount {
  id: string;
  email: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
}

// Pure helpers extracted to reduce handleSearch statement count.

function createNoResultsMarker(query: string, message: string): Email {
  return {
    id: 'no-results',
    subject: '',
    from: '',
    body: '',
    receivedAt: new Date().toISOString(),
    debugInfo: { originalQuery: query, queriesTried: [], message },
  } as any as Email;
}

function buildSearchParams(
  query: string,
  selectedAccountTypes: string[],
  connectedAccounts: ConnectedAccount[]
): Record<string, string> {
  const params: Record<string, string> = { q: query, maxResults: '50', skipLlm: 'true' };
  if (selectedAccountTypes.length > 0 && selectedAccountTypes.length < connectedAccounts.length) {
    params.accountTypes = selectedAccountTypes.join(',');
  }
  return params;
}

interface SearchStateSetters {
  setSearchResults: (results: Email[]) => void;
  setSearchResultsUpdater: (updater: (prev: Email[]) => Email[]) => void;
  setIsRefining: (v: boolean) => void;
  setProgressStep: (s: string) => void;
  setLoading: (v: boolean) => void;
  setQueriesTried: (items: Array<{ query: string; resultCount: number; accountType?: string }>) => void;
}

async function runPhase2Ranking(
  emailIds: string[],
  query: string,
  currentSession: number,
  searchSessionRef: MutableRefObject<number>,
  selectedAccountTypes: string[],
  setters: Pick<SearchStateSetters, 'setSearchResults' | 'setIsRefining'>
): Promise<void> {
  try {
    const rankResponse = await axios.post(`${API_URL}/emails/search/rank`, { emailIds, query, maxResults: 50 });
    if (currentSession === searchSessionRef.current) {
      const rankedData = rankResponse.data;
      if (rankedData?.length > 0) {
        setters.setSearchResults(rankedData);
      }
      captureEvent('search_performed', {
        query_length: query.trim().length,
        has_query: !!query.trim(),
        result_count: rankedData?.length || 0,
        selected_accounts: selectedAccountTypes.length,
        phase: 'refined',
      });
    }
  } catch (rankError) {
    console.error('[Search] Phase 2 LLM ranking failed:', rankError);
  } finally {
    if (currentSession === searchSessionRef.current) {
      setters.setIsRefining(false);
    }
  }
}

async function runPhase3Expansion(
  query: string,
  currentSession: number,
  searchSessionRef: MutableRefObject<number>,
  selectedAccountTypes: string[],
  setters: Pick<SearchStateSetters, 'setSearchResultsUpdater' | 'setIsRefining' | 'setProgressStep'>
): Promise<void> {
  setters.setProgressStep('Searching with alternative queries...');
  try {
    const expandResponse = await axios.post(`${API_URL}/emails/search/expand`, { query, existingEmailIds: [] });
    if (currentSession === searchSessionRef.current) {
      const expandedData: Email[] = expandResponse.data;
      if (expandedData?.length > 0) {
        setters.setSearchResultsUpdater(prev => {
          const existing = prev.filter(event => event.id !== SEARCH_RESULT_NO_RESULTS);
          const existingIds = new Set(existing.map(event => event.id));
          const merged = [...existing, ...expandedData.filter(event => !existingIds.has(event.id))];
          return merged.length === 0
            ? [createNoResultsMarker(query, 'No emails found even with alternative queries')]
            : merged;
        });
        captureEvent('search_performed', {
          query_length: query.trim().length,
          has_query: !!query.trim(),
          result_count: expandedData.length,
          selected_accounts: selectedAccountTypes.length,
          phase: 'expanded',
        });
      }
    }
  } catch (expandError) {
    console.error('[Search] Phase 3 expansion failed:', expandError);
  } finally {
    if (currentSession === searchSessionRef.current) {
      setters.setIsRefining(false);
      setters.setProgressStep('');
    }
  }
}

async function processSearchResults(
  responseData: any[],
  query: string,
  currentSession: number,
  searchSessionRef: MutableRefObject<number>,
  selectedAccountTypes: string[],
  setters: SearchStateSetters
): Promise<void> {
  if (responseData[0]?.debugInfo?.queriesTried) {
    setters.setQueriesTried(responseData[0].debugInfo.queriesTried);
  }
  setters.setSearchResults(responseData);
  setters.setLoading(false);
  captureEvent('search_performed', {
    query_length: query.trim().length,
    has_query: !!query.trim(),
    result_count: responseData.length,
    selected_accounts: selectedAccountTypes.length,
    phase: 'initial',
  });
  const isNoResults = responseData.length === 1 && responseData[0]?.id === SEARCH_RESULT_NO_RESULTS;
  if (!isNoResults) {
    const emailIds = responseData
      .filter((event: Email) => event.id !== SEARCH_RESULT_NO_RESULTS)
      .map((event: Email) => event.id);
    if (emailIds.length > 0) {
      setters.setIsRefining(true);
      await runPhase2Ranking(emailIds, query, currentSession, searchSessionRef, selectedAccountTypes, setters);
    }
  }
  if (isNoResults && currentSession === searchSessionRef.current) {
    setters.setIsRefining(true);
    await runPhase3Expansion(query, currentSession, searchSessionRef, selectedAccountTypes, setters);
  }
}

/**
 * Manages the list of connected accounts and the per-provider selection filter.
 * Extracted from useSearch to keep that hook under the max-lines-per-function limit.
 */
function useConnectedAccounts() {
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([]);

  useEffect(() => {
    const fetchConnectedAccounts = async () => {
      try {
        const response = await axios.get(`${API_URL}/emails/connected-accounts`);
        const accounts = response.data || [];
        setConnectedAccounts(accounts);
        setSelectedAccountTypes(accounts.map((account: ConnectedAccount) => account.provider));
      } catch (error) {
        console.error('Error fetching connected accounts:', error);
      }
    };
    fetchConnectedAccounts();
  }, []);

  const handleAccountToggle = useCallback((accountType: string) => {
    setSelectedAccountTypes(prev => {
      if (prev.includes(accountType)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter(acType => acType !== accountType);
      } else {
        return [...prev, accountType];
      }
    });
  }, []);

  return { connectedAccounts, selectedAccountTypes, handleAccountToggle };
}

export const useSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [queriesTried, setQueriesTried] = useState<Array<{ query: string; resultCount: number; accountType?: string }>>(
    []
  );
  const searchSessionRef = useRef(0);

  const { connectedAccounts, selectedAccountTypes, handleAccountToggle } = useConnectedAccounts();

  const handleSearch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!query.trim()) {
        return;
      }

      const currentSession = ++searchSessionRef.current;
      setLoading(true);
      setIsRefining(false);
      setHasSearched(true);
      setQueriesTried([]);

      const progressInterval = setInterval(() => {
        setProgressStep('Searching for emails...');
      }, 100);
      const stopProgress = () => {
        clearInterval(progressInterval);
        setProgressStep('');
      };
      const stateSetters: SearchStateSetters = {
        setSearchResults,
        setSearchResultsUpdater: setSearchResults as any,
        setIsRefining,
        setProgressStep,
        setLoading,
        setQueriesTried,
      };

      try {
        const params = buildSearchParams(query, selectedAccountTypes, connectedAccounts);
        const response = await axios.get(`${API_URL}/emails/search`, { params });
        stopProgress();
        if (!response.data?.length) {
          setSearchResults([createNoResultsMarker(query, 'Backend returned empty array - check server logs')]);
          setLoading(false);
          return;
        }
        await processSearchResults(
          response.data,
          query,
          currentSession,
          searchSessionRef,
          selectedAccountTypes,
          stateSetters
        );
      } catch (error: any) {
        stopProgress();
        setLoading(false);
        console.error('Error searching emails:', error);
        if (error.response?.status === HTTP_UNAUTHORIZED) {
          alert('Please log in again to search emails.');
          navigate('/login');
        } else {
          alert('Error searching emails. Please try again.');
        }
      }
    },
    [query, navigate, selectedAccountTypes, connectedAccounts]
  );

  return {
    query,
    setQuery,
    searchResults,
    loading,
    isRefining,
    hasSearched,
    progressStep,
    handleSearch,
    connectedAccounts,
    selectedAccountTypes,
    handleAccountToggle,
    queriesTried,
  };
};
