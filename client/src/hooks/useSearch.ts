import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';
import { Email } from 'types/email';
import { SEARCH_RESULT_NO_RESULTS } from 'constants/strings';
import { API_URL } from 'config/api';

interface ConnectedAccount {
  id: string;
  email: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
}

export const useSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([]);
  // Track search session to discard stale async results
  const searchSessionRef = useRef(0);

  // Fetch connected accounts on mount
  useEffect(() => {
    const fetchConnectedAccounts = async () => {
      try {
        const response = await axios.get(`${API_URL}/emails/connected-accounts`);
        const accounts = response.data || [];
        setConnectedAccounts(accounts);
        // Select all accounts by default
        setSelectedAccountTypes(accounts.map((a: ConnectedAccount) => a.provider));
      } catch (error) {
        console.error('Error fetching connected accounts:', error);
      }
    };

    fetchConnectedAccounts();
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Increment session ID so any in-flight refinement from a previous search is discarded
    const currentSession = ++searchSessionRef.current;

    setLoading(true);
    setIsRefining(false);
    setHasSearched(true);

    const steps = [
      { delay: 0, message: 'Crafting search query...' },
      { delay: 800, message: 'Searching for emails...' },
    ];

    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentStep = steps
        .slice()
        .reverse()
        .find(step => elapsed >= step.delay);
      if (currentStep) {
        setProgressStep(currentStep.message);
      }
    }, 100);

    try {
      const params: any = { q: query, maxResults: 50, skipLlm: 'true' };
      if (selectedAccountTypes.length > 0 && selectedAccountTypes.length < connectedAccounts.length) {
        params.accountTypes = selectedAccountTypes.join(',');
      }

      // Phase 1: Fast search (no LLM ranking) – show results immediately
      const response = await axios.get(`${API_URL}/emails/search`, { params });
      clearInterval(progressInterval);
      setProgressStep('');

      const responseData = response.data;
      console.log('[Search] Phase 1 API response:', {
        dataLength: responseData?.length,
        firstItem: responseData?.[0],
        isNoResultsMarker: responseData?.[0]?.id === SEARCH_RESULT_NO_RESULTS,
        debugInfo: responseData?.[0]?.debugInfo,
      });

      if (!responseData || responseData.length === 0) {
        console.warn('[Search] Received empty array, creating no-results marker');
        setSearchResults([{
          id: 'no-results',
          subject: '',
          from: '',
          body: '',
          receivedAt: new Date().toISOString(),
          debugInfo: {
            originalQuery: query,
            queriesTried: [],
            message: 'Backend returned empty array - check server logs for details',
          },
        } as any as Email]);
        setLoading(false);
        return;
      }

      setSearchResults(responseData);
      setLoading(false);

      captureEvent('search_performed', {
        query_length: query.trim().length,
        has_query: !!query.trim(),
        result_count: responseData?.length || 0,
        selected_accounts: selectedAccountTypes.length,
        phase: 'initial',
      });

      // Phase 2: Async LLM ranking – only if we have real results to refine
      const isNoResults = responseData.length === 1 && responseData[0]?.id === SEARCH_RESULT_NO_RESULTS;
      let rankedEmailIds: string[] = [];
      if (!isNoResults) {
        const emailIds = responseData
          .filter((e: Email) => e.id !== SEARCH_RESULT_NO_RESULTS)
          .map((e: Email) => e.id);
        rankedEmailIds = emailIds;

        if (emailIds.length > 0) {
          setIsRefining(true);
          try {
            const rankResponse = await axios.post(`${API_URL}/emails/search/rank`, {
              emailIds,
              query,
              maxResults: 50,
            });

            // Only update results if this search session is still current
            if (currentSession === searchSessionRef.current) {
              const rankedData = rankResponse.data;
              if (rankedData && rankedData.length > 0) {
                setSearchResults(rankedData);
                rankedEmailIds = rankedData.map((e: Email) => e.id);
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
            // Keep Phase 1 results on failure
          } finally {
            if (currentSession === searchSessionRef.current) {
              setIsRefining(false);
            }
          }
        }
      }

      // Phase 3: If LLM filtered everything out (or initial search found nothing),
      // try alternative/broader queries and add new results to the display
      const currentResults = isNoResults ? [] : rankedEmailIds;
      const shouldExpand = isNoResults || currentResults.length === 0;
      if (shouldExpand && currentSession === searchSessionRef.current) {
        setIsRefining(true);
        setProgressStep('Searching with alternative queries...');
        try {
          const expandResponse = await axios.post(`${API_URL}/emails/search/expand`, {
            query,
            existingEmailIds: currentResults,
          });

          if (currentSession === searchSessionRef.current) {
            const expandedData: Email[] = expandResponse.data;
            if (expandedData && expandedData.length > 0) {
              setSearchResults(prev => {
                // Filter out the no-results marker and merge with new results
                const existing = prev.filter(e => e.id !== SEARCH_RESULT_NO_RESULTS);
                const existingIds = new Set(existing.map(e => e.id));
                const newResults = expandedData.filter(e => !existingIds.has(e.id));
                const merged = [...existing, ...newResults];
                // If we still have nothing, show no-results
                if (merged.length === 0) {
                  return [{
                    id: 'no-results',
                    subject: '',
                    from: '',
                    body: '',
                    receivedAt: new Date().toISOString(),
                    debugInfo: {
                      originalQuery: query,
                      queriesTried: [],
                      message: 'No emails found even with alternative queries',
                    },
                  } as any as Email];
                }
                return merged;
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
            setIsRefining(false);
            setProgressStep('');
          }
        }
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      setProgressStep('');
      setLoading(false);
      console.error('Error searching emails:', error);
      if (error.response?.status === HTTP_UNAUTHORIZED) {
        alert('Please log in again to search emails.');
        navigate('/login');
      } else {
        alert('Error searching emails. Please try again.');
      }
    }
  }, [query, navigate, selectedAccountTypes, connectedAccounts]);

  const handleAccountToggle = useCallback((accountType: string) => {
    setSelectedAccountTypes(prev => {
      if (prev.includes(accountType)) {
        // Don't allow deselecting the last account
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== accountType);
      } else {
        return [...prev, accountType];
      }
    });
  }, []);

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
  };
};
