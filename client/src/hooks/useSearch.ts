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
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useConnectedAccountsQuery } from 'queries/useConnectedAccountsQuery';
import {
  Email,
  EnrichedSearchResult,
  EnrichmentStatusResponse,
  GmailSearchResult,
  INSTANT_RANK_STATUS,
  InstantRankStatus,
  InstantSearchResponse,
} from 'types/email';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { SEARCH_QUERY_PARAM, SEARCH_RESULT_NO_RESULTS, STATUS_COMPLETE, STATUS_FAILED } from 'constants/strings';

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
function isInstantSearchResponse(serverResponse: unknown): serverResponse is InstantSearchResponse {
  return (
    typeof serverResponse === 'object' &&
    serverResponse !== null &&
    'results' in serverResponse &&
    Array.isArray((serverResponse as Record<string, unknown>).results) &&
    'enrichmentJobId' in serverResponse
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

/** Result shape returned by POST /emails/search/rank (Email + AI relevance metadata). */
type RankedEmail = Email & { relevanceScore?: number; searchExplanation?: string };

/**
 * Reorder the instant results by AI relevance and graft the relevanceScore +
 * searchExplanation onto each enriched result. Results the ranker dropped (or
 * that never enriched) keep their relative order at the end, so nothing is lost.
 */
export function applyRelevanceRanking(
  current: Array<GmailSearchResult | Email>,
  ranked: RankedEmail[]
): Array<GmailSearchResult | Email> {
  const rankPos = new Map<string, number>();
  const metaById = new Map<string, { relevanceScore?: number; searchExplanation?: string }>();
  ranked.forEach((item, index) => {
    rankPos.set(item.id, index);
    metaById.set(item.id, { relevanceScore: item.relevanceScore, searchExplanation: item.searchExplanation });
  });

  const positionOf = (item: GmailSearchResult | Email): number => {
    const id = (item as EnrichedSearchResult).id;
    return id != null && rankPos.has(id) ? (rankPos.get(id) as number) : Number.MAX_SAFE_INTEGER;
  };

  const annotated = current.map(item => {
    const id = (item as EnrichedSearchResult).id;
    const meta = id ? metaById.get(id) : undefined;
    return meta ? ({ ...item, ...meta } as GmailSearchResult | Email) : item;
  });
  return [...annotated].sort((first, second) => positionOf(first) - positionOf(second));
}

/**
 * Re-rank the enriched instant results by AI relevance once enrichment finishes.
 * Reuses the same /emails/search/rank endpoint the legacy path uses. Falls open
 * (keeps Gmail order) on any error.
 */
async function rerankInstantResults(options: {
  query: string;
  enrichedResults: EnrichedSearchResult[];
  currentSession: number;
  searchSessionRef: MutableRefObject<number>;
  setInstantResults: React.Dispatch<React.SetStateAction<Array<GmailSearchResult | Email>>>;
  setInstantRankStatus: React.Dispatch<React.SetStateAction<InstantRankStatus | null>>;
}): Promise<void> {
  const { query, enrichedResults, currentSession, searchSessionRef, setInstantResults, setInstantRankStatus } = options;
  const emailIds = enrichedResults.map(result => result.id).filter(Boolean);
  if (emailIds.length === 0) {
    setInstantRankStatus(INSTANT_RANK_STATUS.RE_RANKED);
    return;
  }
  setInstantRankStatus(INSTANT_RANK_STATUS.RE_RANKING);
  try {
    const response = await axios.post<RankedEmail[]>(`${API_URL}/emails/search/rank`, {
      emailIds,
      query,
      maxResults: 50,
    });
    if (currentSession !== searchSessionRef.current) {
      return;
    }
    const ranked = response.data ?? [];
    if (ranked.length > 0) {
      setInstantResults(prev => applyRelevanceRanking(prev, ranked));
    }
    setInstantRankStatus(INSTANT_RANK_STATUS.RE_RANKED);
  } catch (rerankError) {
    console.error('[Search] Instant re-rank failed:', rerankError);
    // Fail open — keep the Gmail-ordered results rather than blanking them.
    if (currentSession === searchSessionRef.current) {
      setInstantRankStatus(INSTANT_RANK_STATUS.RE_RANKED);
    }
  }
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 15;

async function pollEnrichmentUpdates(options: {
  jobId: string;
  query: string;
  currentSession: number;
  searchSessionRef: MutableRefObject<number>;
  setInstantResults: React.Dispatch<React.SetStateAction<Array<GmailSearchResult | Email>>>;
  setEnrichmentProgress: React.Dispatch<React.SetStateAction<EnrichmentProgressState | null>>;
  setInstantRankStatus: React.Dispatch<React.SetStateAction<InstantRankStatus | null>>;
}): Promise<void> {
  const { jobId, query, currentSession, searchSessionRef, setInstantResults, setEnrichmentProgress, setInstantRankStatus } =
    options;

  let lastEnriched: EnrichedSearchResult[] = [];
  let completed = false;

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
        lastEnriched = enrichedResults;
        setInstantResults(prev => mergeEnrichedResults(prev, enrichedResults) as Array<GmailSearchResult | Email>);
      }

      setEnrichmentProgress({ total: progress.total, enriched: progress.enriched });

      if (status === STATUS_COMPLETE || status === STATUS_FAILED) {
        completed = status === STATUS_COMPLETE;
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

  // Once bodies are synced, re-rank the results by AI relevance in the background.
  if (completed && currentSession === searchSessionRef.current) {
    await rerankInstantResults({
      query,
      enrichedResults: lastEnriched,
      currentSession,
      searchSessionRef,
      setInstantResults,
      setInstantRankStatus,
    });
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
  setSearchDurationMs: (ms: number) => void;
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
  setters.setSearchDurationMs(phase1DurationMs);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get(SEARCH_QUERY_PARAM) ?? '');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [queriesTried, setQueriesTried] = useState<Array<{ query: string; resultCount: number; accountType?: string }>>(
    []
  );
  /** Wall-clock time (ms) for the visible search to return its first results. */
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(null);

  // Instant search state
  const [instantResults, setInstantResults] = useState<Array<GmailSearchResult | Email>>([]);
  const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgressState | null>(null);
  const [isInstantSearch, setIsInstantSearch] = useState(false);
  /** True when the instant search path returned zero results (distinct from a non-instant empty). */
  const [isInstantEmpty, setIsInstantEmpty] = useState(false);
  /** Tracks the AI relevance re-rank lifecycle for instant results (null = not applicable). */
  const [instantRankStatus, setInstantRankStatus] = useState<InstantRankStatus | null>(null);

  const searchSessionRef = useRef(0);
  /** Last query that was actually executed — prevents the URL-sync effect from re-running it. */
  const lastExecutedQueryRef = useRef<string | null>(null);

  const { connectedAccounts, selectedAccountTypes, handleAccountToggle } = useConnectedAccounts();

  const runSearch = useCallback(
// eslint-disable-next-line max-statements -- pre-existing: complex async handler with many conditional branches
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
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
      setInstantRankStatus(null);
      setSearchDurationMs(null);

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
        setSearchDurationMs,
      };

      try {
        const params = buildSearchParams(searchQuery, selectedAccountTypes, connectedAccounts);
        const response = await axios.get(`${API_URL}/emails/search`, { params });
        stopProgress();

        // -----------------------------------------------------------------------
        // Instant search path: backend returned InstantSearchResponse
        // -----------------------------------------------------------------------
        if (isInstantSearchResponse(response.data)) {
          const { results, enrichmentJobId, totalGmailResults } = response.data;

          setIsInstantSearch(true);
          setLoading(false);
          setSearchDurationMs(Date.now() - searchStartMs);

          if (results.length === 0) {
            setIsInstantEmpty(true);
            setInstantResults([]);
            return;
          }

          setIsInstantEmpty(false);
          setInstantResults(results);
          setInstantRankStatus(INSTANT_RANK_STATUS.GMAIL_ORDER);
          setEnrichmentProgress({ total: totalGmailResults, enriched: 0 });

          captureEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
            query_length: searchQuery.trim().length,
            has_query: !!searchQuery.trim(),
            result_count: results.length,
            selected_accounts: selectedAccountTypes.length,
            phase: 'instant',
            duration_ms: Date.now() - searchStartMs,
          });

          // Start background polling if enrichment job was created
          if (enrichmentJobId) {
            pollEnrichmentUpdates({
              jobId: enrichmentJobId,
              query: searchQuery,
              currentSession,
              searchSessionRef,
              setInstantResults,
              setEnrichmentProgress,
              setInstantRankStatus,
            });
          }
          return;
        }

        // -----------------------------------------------------------------------
        // Legacy path: backend returned Email[]
        // -----------------------------------------------------------------------
        if (!response.data?.length) {
          setSearchResults([createNoResultsMarker(searchQuery, 'Backend returned empty array - check server logs')]);
          setLoading(false);
          return;
        }
        await processSearchResults({
          responseData: response.data,
          query: searchQuery,
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
    [navigate, selectedAccountTypes, connectedAccounts]
  );

  const handleSearch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      lastExecutedQueryRef.current = trimmed;
      // Keep the query in the URL so returning from an opened email (or sharing
      // the link) restores the same search.
      setSearchParams({ [SEARCH_QUERY_PARAM]: trimmed });
      await runSearch(trimmed);
    },
    [query, runSearch, setSearchParams]
  );

  // Restore the search from the URL on mount / back-navigation (e.g. returning
  // from an email opened from the results list). When the URL query is removed
  // (sidebar Search click, manual clear) the previous input and results are
  // reset; the ref guard means a blank search page where the user is typing a
  // not-yet-executed query is left untouched.
  useEffect(() => {
    const urlQuery = searchParams.get(SEARCH_QUERY_PARAM)?.trim();
    if (urlQuery && urlQuery !== lastExecutedQueryRef.current) {
      lastExecutedQueryRef.current = urlQuery;
      setQuery(urlQuery);
      runSearch(urlQuery);
    } else if (!urlQuery && lastExecutedQueryRef.current !== null) {
      lastExecutedQueryRef.current = null;
      // Invalidate any in-flight search/enrichment so a late response cannot
      // repopulate the cleared results.
      searchSessionRef.current += 1;
      setQuery('');
      setSearchResults([]);
      setInstantResults([]);
      setHasSearched(false);
      setLoading(false);
      setIsRefining(false);
      setIsInstantSearch(false);
      setIsInstantEmpty(false);
      setInstantRankStatus(null);
      setEnrichmentProgress(null);
      setQueriesTried([]);
      setSearchDurationMs(null);
    }
  }, [searchParams, runSearch]);

  return {
    query,
    setQuery,
    // Legacy results (Email[]) — populated by the legacy search path
    searchResults,
    loading,
    isRefining,
    hasSearched,
    progressStep,
    searchDurationMs,
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
    instantRankStatus,
  };
};
