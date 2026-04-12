/**
 * useSearch / useConnectedAccounts (local)
 *
 * Migrated /emails/connected-accounts fetch in useConnectedAccounts() to
 * useConnectedAccountsQuery (TanStack Query). The effect + local state that
 * previously fetched independently are replaced by the shared cache.
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 *
 * Instant search support added in #1464:
 * When the backend returns an InstantSearchResponse shape (has `results` +
 * `enrichmentJobId`), Phase 1 results are shown immediately and a background
 * polling loop merges enriched results in-place.
 */
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useConnectedAccountsQuery } from 'queries/useConnectedAccountsQuery';
import {
  Email,
  EnrichedSearchResult,
  EnrichmentStatusResponse,
  GmailSearchResult,
  InstantSearchResponse,
} from 'types/email';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { SEARCH_RESULT_NO_RESULTS, STATUS_COMPLETE, STATUS_FAILED } from 'constants/strings';

interface ConnectedAccount {
  id: string;
  email: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Enrichment progress state (exposed by useSearch for EnrichmentProgress bar)
// ---------------------------------------------------------------------------

export interface EnrichmentProgressState {
  total: number;
  enriched: number;
  /** True when the enrichment poll failed — the UI should show an error indicator. */
  failed?: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function createNoResultsMarker(query: string, message: string): Email {
  return {
    id: 'no-results',
    subject: '',
    from: '',
    receivedAt: new Date().toISOString(),
    debugInfo: { originalQuery: query, queriesTried: [], message },
    isRead: true,
    isSnoozed: false,
    threadId: '',
  };
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

/**
 * Type-guard: checks whether the server returned the instant search shape.
 */
function isInstantSearchResponse(data: unknown): data is InstantSearchResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'results' in data &&
    Array.isArray((data as Record<string, unknown>).results) &&
    'enrichmentJobId' in data
  );
}

/** Merge newly-enriched results into the existing results array (in-place update). */
function mergeEnrichedResults(
  current: Array<GmailSearchResult | Email>,
  enriched: EnrichedSearchResult[]
): Array<GmailSearchResult | Email> {
  const enrichedMap = new Map(enriched.map(enrichedItem => [enrichedItem.messageId, enrichedItem]));
  return current.map(result => {
    const messageId = (result as GmailSearchResult).messageId;
    if (!messageId) {
      return result;
    }
    const enrichedVersion = enrichedMap.get(messageId);
    return enrichedVersion ?? result;
  });
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 15;

async function pollEnrichmentUpdates(options: {
  jobId: string;
  currentSession: number;
  searchSessionRef: MutableRefObject<number>;
  setInstantResults: React.Dispatch<React.SetStateAction<Array<GmailSearchResult | Email>>>;
  setEnrichmentProgress: React.Dispatch<React.SetStateAction<EnrichmentProgressState | null>>;
}): Promise<void> {
  const { jobId, currentSession, searchSessionRef, setInstantResults, setEnrichmentProgress } = options;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    // Bail if user started a new search
    if (currentSession !== searchSessionRef.current) {
      return;
    }

    try {
      const response = await axios.get<EnrichmentStatusResponse>(`${API_URL}/emails/search/enrichment/${jobId}`);
      const { enrichedResults, status, progress } = response.data;

      if (currentSession !== searchSessionRef.current) {
        return;
      }

      if (enrichedResults.length > 0) {
        setInstantResults(prev => mergeEnrichedResults(prev, enrichedResults) as Array<GmailSearchResult | Email>);
      }

      setEnrichmentProgress({ total: progress.total, enriched: progress.enriched });

      if (status === STATUS_COMPLETE || status === STATUS_FAILED) {
        break;
      }
    } catch (pollError) {
      console.error('[Search] Enrichment poll failed:', pollError);
      // Show a failed state so the UI can display "details could not be loaded"
      // rather than silently leaving partial results with no indication of failure.
      if (currentSession === searchSessionRef.current) {
        setEnrichmentProgress({ total: 0, enriched: 0, failed: true });
      }
      return;
    }
  }

  // Clear progress bar when done
  if (currentSession === searchSessionRef.current) {
    setEnrichmentProgress(null);
  }
}

// ---------------------------------------------------------------------------
// Legacy search path helpers (unchanged)
// ---------------------------------------------------------------------------

interface SearchStateSetters {
  setSearchResults: (results: Email[]) => void;
  setSearchResultsUpdater: (updater: (prev: Email[]) => Email[]) => void;
  setIsRefining: (v: boolean) => void;
  setProgressStep: (s: string) => void;
  setLoading: (v: boolean) => void;
  setQueriesTried: (items: Array<{ query: string; resultCount: number; accountType?: string }>) => void;
}

async function runPhase2Ranking(options: {
  emailIds: string[];
  query: string;
  currentSession: number;
  searchSessionRef: MutableRefObject<number>;
  selectedAccountTypes: string[];
  setters: Pick<SearchStateSetters, 'setSearchResults' | 'setIsRefining'>;
}): Promise<void> {
  const { emailIds, query, currentSession, searchSessionRef, selectedAccountTypes, setters } = options;
  const phase2StartMs = Date.now();
  try {
    const rankResponse = await axios.post(`${API_URL}/emails/search/rank`, { emailIds, query, maxResults: 50 });
    if (currentSession === searchSessionRef.current) {
      const rankedData = rankResponse.data;
      if (rankedData?.length > 0) {
        setters.setSearchResults(rankedData);
      }
      const phase2DurationMs = Date.now() - phase2StartMs;
      captureEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
        query_length: query.trim().length,
        has_query: !!query.trim(),
        result_count: rankedData?.length || 0,
        selected_accounts: selectedAccountTypes.length,
        phase: 'refined',
        duration_ms: phase2DurationMs,
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
  const phase3StartMs = Date.now();
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
        const phase3DurationMs = Date.now() - phase3StartMs;
        captureEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
          query_length: query.trim().length,
          has_query: !!query.trim(),
          result_count: expandedData.length,
          selected_accounts: selectedAccountTypes.length,
          phase: 'expanded',
          duration_ms: phase3DurationMs,
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

const SEARCH_SLOW_THRESHOLD_MS = 2000;

async function processSearchResults(options: {
  responseData: Email[];
  query: string;
  currentSession: number;
  searchSessionRef: MutableRefObject<number>;
  selectedAccountTypes: string[];
  setters: SearchStateSetters;
  searchStartMs: number;
}): Promise<void> {
  const { responseData, query, currentSession, searchSessionRef, selectedAccountTypes, setters, searchStartMs } =
    options;
  const queriesTried = responseData[0]?.debugInfo?.queriesTried;
  if (Array.isArray(queriesTried)) {
    setters.setQueriesTried(queriesTried as Array<{ query: string; resultCount: number; accountType?: string }>);
  }
  setters.setSearchResults(responseData);
  setters.setLoading(false);
  const phase1DurationMs = Date.now() - searchStartMs;
  captureEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
    query_length: query.trim().length,
    has_query: !!query.trim(),
    result_count: responseData.length,
    selected_accounts: selectedAccountTypes.length,
    phase: 'initial',
    duration_ms: phase1DurationMs,
  });
  if (phase1DurationMs > SEARCH_SLOW_THRESHOLD_MS) {
    captureEvent(ANALYTICS_EVENTS.SEARCH_SLOW, {
      query_length: query.trim().length,
      duration_ms: phase1DurationMs,
      result_count: responseData.length,
      phase: 'initial',
    });
  }
  const isNoResults = responseData.length === 1 && responseData[0]?.id === SEARCH_RESULT_NO_RESULTS;
  if (!isNoResults) {
    const emailIds = responseData
      .filter((event: Email) => event.id !== SEARCH_RESULT_NO_RESULTS)
      .map((event: Email) => event.id);
    if (emailIds.length > 0) {
      setters.setIsRefining(true);
      await runPhase2Ranking({ emailIds, query, currentSession, searchSessionRef, selectedAccountTypes, setters });
    }
  }
  if (isNoResults && currentSession === searchSessionRef.current) {
    setters.setIsRefining(true);
    await runPhase3Expansion(query, currentSession, searchSessionRef, selectedAccountTypes, setters);
  }
}

// ---------------------------------------------------------------------------
// useConnectedAccounts
// ---------------------------------------------------------------------------

/**
 * Manages the list of connected accounts and the per-provider selection filter.
 * Extracted from useSearch to keep that hook under the max-lines-per-function limit.
 */
function useConnectedAccounts() {
  const { data: fetchedAccounts = [] } = useConnectedAccountsQuery();
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([]);

  // Sync local state from query cache (query handles dedup and caching)
  useEffect(() => {
    if (fetchedAccounts.length > 0) {
      setConnectedAccounts(fetchedAccounts);
      setSelectedAccountTypes(fetchedAccounts.map((account: ConnectedAccount) => account.provider));
    }
  }, [fetchedAccounts]);

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

// ---------------------------------------------------------------------------
// useSearch
// ---------------------------------------------------------------------------

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

  // Instant search state
  const [instantResults, setInstantResults] = useState<Array<GmailSearchResult | Email>>([]);
  const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgressState | null>(null);
  const [isInstantSearch, setIsInstantSearch] = useState(false);
  /** True when the instant search path returned zero results (distinct from a non-instant empty). */
  const [isInstantEmpty, setIsInstantEmpty] = useState(false);

  const searchSessionRef = useRef(0);

  const { connectedAccounts, selectedAccountTypes, handleAccountToggle } = useConnectedAccounts();

  const handleSearch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!query.trim()) {
        return;
      }

      const currentSession = ++searchSessionRef.current;
      const searchStartMs = Date.now();
      setLoading(true);
      setIsRefining(false);
      setHasSearched(true);
      setQueriesTried([]);
      setInstantResults([]);
      setEnrichmentProgress(null);
      setIsInstantSearch(false);
      setIsInstantEmpty(false);

      const progressInterval = setInterval(() => {
        setProgressStep('Searching for emails...');
      }, 100);
      const stopProgress = () => {
        clearInterval(progressInterval);
        setProgressStep('');
      };
      const stateSetters: SearchStateSetters = {
        setSearchResults,
        setSearchResultsUpdater: (updater: (prev: Email[]) => Email[]) => setSearchResults(updater),
        setIsRefining,
        setProgressStep,
        setLoading,
        setQueriesTried,
      };

      try {
        const params = buildSearchParams(query, selectedAccountTypes, connectedAccounts);
        const response = await axios.get(`${API_URL}/emails/search`, { params });
        stopProgress();

        // -----------------------------------------------------------------------
        // Instant search path: backend returned InstantSearchResponse
        // -----------------------------------------------------------------------
        if (isInstantSearchResponse(response.data)) {
          const { results, enrichmentJobId, totalGmailResults } = response.data;

          setIsInstantSearch(true);
          setLoading(false);

          if (results.length === 0) {
            setIsInstantEmpty(true);
            setInstantResults([]);
            return;
          }

          setIsInstantEmpty(false);
          setInstantResults(results);
          setEnrichmentProgress({ total: totalGmailResults, enriched: 0 });

          captureEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
            query_length: query.trim().length,
            has_query: !!query.trim(),
            result_count: results.length,
            selected_accounts: selectedAccountTypes.length,
            phase: 'instant',
            duration_ms: Date.now() - searchStartMs,
          });

          // Start background polling if enrichment job was created
          if (enrichmentJobId) {
            pollEnrichmentUpdates({
              jobId: enrichmentJobId,
              currentSession,
              searchSessionRef,
              setInstantResults,
              setEnrichmentProgress,
            });
          }
          return;
        }

        // -----------------------------------------------------------------------
        // Legacy path: backend returned Email[]
        // -----------------------------------------------------------------------
        if (!response.data?.length) {
          setSearchResults([createNoResultsMarker(query, 'Backend returned empty array - check server logs')]);
          setLoading(false);
          return;
        }
        await processSearchResults({
          responseData: response.data,
          query,
          currentSession,
          searchSessionRef,
          selectedAccountTypes,
          setters: stateSetters,
          searchStartMs,
        });
      } catch (error: unknown) {
        stopProgress();
        setLoading(false);
        console.error('Error searching emails:', error);
        if (axios.isAxiosError(error) && error.response?.status === HTTP_UNAUTHORIZED) {
          alert('Please log in again to search emails.');
          navigate('/login');
        } else {
          alert(getAxiosErrorMessage(error, 'Error searching emails. Please try again.'));
        }
      }
    },
    [query, navigate, selectedAccountTypes, connectedAccounts]
  );

  return {
    query,
    setQuery,
    // Legacy results (Email[]) — populated by the legacy search path
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
    // Instant search results — populated by the instant search path
    instantResults,
    enrichmentProgress,
    isInstantSearch,
    isInstantEmpty,
  };
};
