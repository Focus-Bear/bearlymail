import { useState, useCallback, useEffect } from 'react';
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
  const [hasSearched, setHasSearched] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([]);

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

    setLoading(true);
    setHasSearched(true);

    const steps = [
      { delay: 0, message: 'Crafting search query...' },
      { delay: 800, message: 'Searching for emails...' },
      { delay: 2000, message: 'Filtering emails with AI...' },
      { delay: 3500, message: 'Generating explanations...' },
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
      const params: any = { q: query, maxResults: 50 };
      if (selectedAccountTypes.length > 0 && selectedAccountTypes.length < connectedAccounts.length) {
        params.accountTypes = selectedAccountTypes.join(',');
      }

      const response = await axios.get(`${API_URL}/emails/search`, { params });
      clearInterval(progressInterval);
      setProgressStep('');

      const responseData = response.data;
      console.log('[Search] API response:', {
        dataLength: responseData?.length,
        firstItem: responseData?.[0],
        isNoResultsMarker: responseData?.[0]?.id === SEARCH_RESULT_NO_RESULTS,
        debugInfo: responseData?.[0]?.debugInfo,
        fullResponse: responseData,
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
      } else {
        setSearchResults(responseData);
      }
      captureEvent('search_performed', {
        query_length: query.trim().length,
        has_query: !!query.trim(),
        result_count: responseData?.length || 0,
        selected_accounts: selectedAccountTypes.length,
      });
    } catch (error: any) {
      clearInterval(progressInterval);
      setProgressStep('');
      console.error('Error searching emails:', error);
      if (error.response?.status === HTTP_UNAUTHORIZED) {
        alert('Please log in again to search emails.');
        navigate('/login');
      } else {
        alert('Error searching emails. Please try again.');
      }
    } finally {
      setLoading(false);
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
    hasSearched,
    progressStep,
    handleSearch,
    connectedAccounts,
    selectedAccountTypes,
    handleAccountToggle,
  };
};
