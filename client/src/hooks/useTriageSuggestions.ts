import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { Email, TriageSuggestion } from 'types/email';

import { API_URL } from 'config/api';
import { TRIAGE_SUGGESTIONS_LIMIT_20 } from 'constants/numbers';

interface UseTriageSuggestionsReturn {
  triageSuggestions: Map<string, TriageSuggestion>;
  loadingSuggestions: boolean;
  fetchTriageSuggestions: (emails: Email[]) => Promise<void>;
  removeSuggestion: (emailId: string) => void;
  clearSuggestionsCache: () => void;
  trackOverride: (
    emailId: string,
    suggestion: TriageSuggestion,
    userAction: { starCount: number; archived: boolean }
  ) => Promise<void>;
}

export function useTriageSuggestions(): UseTriageSuggestionsReturn {
  const [triageSuggestions, setTriageSuggestions] = useState<Map<string, TriageSuggestion>>(new Map());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const lastFetchedEmailIdsRef = useRef<string>('');

  const fetchTriageSuggestions = useCallback(
    async (emails: Email[]) => {
      if (emails.length === 0 || loadingSuggestions) {
        return;
      }

      const emailIds = emails.slice(0, TRIAGE_SUGGESTIONS_LIMIT_20).map(event => event.id);
      const emailIdsKey = emailIds.sort().join(',');

      // Skip if we've already fetched for these exact emails
      if (lastFetchedEmailIdsRef.current === emailIdsKey) {
        return;
      }

      setLoadingSuggestions(true);
      try {
        const response = await axios.post(`${API_URL}/priority/triage-suggestions`, { emailIds });
        const suggestionsMap = new Map<string, TriageSuggestion>();
        response.data.forEach((suggestion: TriageSuggestion & { emailId: string }) => {
          suggestionsMap.set(suggestion.emailId, suggestion);
        });
        setTriageSuggestions(suggestionsMap);
        lastFetchedEmailIdsRef.current = emailIdsKey;
      } catch (error) {
        console.error('Error fetching triage suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [loadingSuggestions]
  );

  const removeSuggestion = useCallback((emailId: string) => {
    setTriageSuggestions(prev => {
      const newMap = new Map(prev);
      newMap.delete(emailId);
      return newMap;
    });
  }, []);

  const clearSuggestionsCache = useCallback(() => {
    lastFetchedEmailIdsRef.current = '';
  }, []);

  const trackOverride = useCallback(
    async (emailId: string, suggestion: TriageSuggestion, userAction: { starCount: number; archived: boolean }) => {
      try {
        await axios.post(`${API_URL}/priority/triage-suggestions/override`, {
          emailId,
          suggestion,
          userAction,
        });
        removeSuggestion(emailId);
      } catch (error) {
        console.error('Error tracking override:', error);
      }
    },
    [removeSuggestion]
  );

  return {
    triageSuggestions,
    loadingSuggestions,
    fetchTriageSuggestions,
    removeSuggestion,
    clearSuggestionsCache,
    trackOverride,
  };
}
