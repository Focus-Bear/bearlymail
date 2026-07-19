import { useCallback, useState } from 'react';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';

import { useAdminMfa } from './AdminMfaGate';

export interface DebugAnnotatedToken {
  input: string;
  source: 'full-query' | 'word' | 'word-prefix' | 'trigram' | 'exact-email-hash';
  hash: string;
}

export interface DebugSqlCandidate {
  id: string;
  provider: string;
  providerId: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  contactFrequency: number;
  isFavorite: boolean;
  storedTokensLength: number;
  storedTokensPreview: string;
  matchedQueryTokens: DebugAnnotatedToken[];
  passesPostFilter: boolean;
  postFilterReason: string;
  positionInSqlOrder: number;
  wouldSurviveTake8: boolean;
}

export interface DebugTargetContact {
  found: boolean;
  lookedUpEmailHash: string;
  id?: string;
  provider?: string;
  providerId?: string;
  email?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  contactFrequency?: number;
  storedTokensRaw?: string | null;
  storedTokensParsedCount?: number | null;
  storedTokensParseError?: string | null;
  queryTokensInStored?: Array<DebugAnnotatedToken & { presentInStored: boolean }>;
  wouldMatchSql?: boolean;
  passesPostFilter?: boolean;
  postFilterReason?: string;
  positionInSqlOrder?: number;
  wouldSurviveTake8?: boolean;
  rankedBeyondScanCap?: boolean;
}

export interface DebugAccountStats {
  totalContacts: number;
  nullSearchTokens: number;
  emptySearchTokens: number;
  populatedSearchTokens: number;
}

export interface RebuildSearchTokensResponse {
  scanned: number;
  updated: number;
  remaining: number;
  errors: Array<{ contactId: string; error: string }>;
}

export interface ContactSearchDebugResponse {
  query: string;
  userId: string;
  queryTokens: DebugAnnotatedToken[];
  exactMatchEmailHash: string;
  exactMatch: { id: string; email: string } | null;
  sqlMatchingTotalCount: number;
  sqlScanCap: number;
  sqlCandidatesScannedCount: number;
  sqlScanCapHit: boolean;
  sqlCandidates: DebugSqlCandidate[];
  prodSearchTakeLimit: number;
  gmailConnected: boolean;
  gmailResults: Array<{ providerId: string; email: string; name?: string }>;
  gmailError: string | null;
  targetContact: DebugTargetContact | null;
  accountStats: DebugAccountStats;
}

/**
 * Pure caller for the contact-search debug endpoint. Use this when the query
 * is owned by something else (e.g. the inline panel reads it from the
 * Contacts page search box). The form-driven `useContactSearchDebug` wraps
 * this with local input state for the admin tab.
 *
 * Remembers the most recent (query, targetEmail) pair so `runAgain` can
 * silently refresh after a rebuild without the caller plumbing those values
 * through again.
 */
export function useContactSearchDebugRunner() {
  const { onMfaRequired } = useAdminMfa();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactSearchDebugResponse | null>(null);
  const [lastParams, setLastParams] = useState<{ query: string; targetEmail?: string } | null>(null);

  const run = useCallback(
    async (query: string, targetEmail?: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        setError('Query is required');
        setResult(null);
        return;
      }
      setError(null);
      setLoading(true);
      setLastParams({ query: trimmedQuery, targetEmail });
      try {
        const response = await axios.get<ContactSearchDebugResponse>(`${API_URL}/contacts/admin/search-debug`, {
          params: {
            q: trimmedQuery,
            ...(targetEmail && targetEmail.trim() ? { targetEmail: targetEmail.trim() } : {}),
          },
        });
        setResult(response.data);
      } catch (requestError) {
        const mfaType = getMfaErrorType(requestError);
        if (mfaType) {
          onMfaRequired(mfaType);
          return;
        }
        setError(getAxiosErrorMessage(requestError, 'Request failed'));
      } finally {
        setLoading(false);
      }
    },
    [onMfaRequired]
  );

  const runAgain = useCallback(async () => {
    if (!lastParams) {
return;
}
    await run(lastParams.query, lastParams.targetEmail);
  }, [lastParams, run]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { loading, error, result, run, runAgain, reset };
}

/**
 * POSTs to the rebuild endpoint. Pass `contactId` to fix a single row
 * (e.g. from the target-contact card), or omit it to backfill the next
 * batch of NULL/empty `searchTokens` rows for the caller.
 */
export function useRebuildSearchTokens() {
  const { onMfaRequired } = useAdminMfa();
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RebuildSearchTokensResponse | null>(null);

  const rebuild = useCallback(
    async (contactId?: string): Promise<RebuildSearchTokensResponse | null> => {
      setError(null);
      setRebuilding(true);
      try {
        const response = await axios.post<RebuildSearchTokensResponse>(
          `${API_URL}/contacts/admin/rebuild-search-tokens`,
          contactId ? { contactId } : {}
        );
        setLastResult(response.data);
        return response.data;
      } catch (requestError) {
        const mfaType = getMfaErrorType(requestError);
        if (mfaType) {
          onMfaRequired(mfaType);
          return null;
        }
        setError(getAxiosErrorMessage(requestError, 'Rebuild failed'));
        return null;
      } finally {
        setRebuilding(false);
      }
    },
    [onMfaRequired]
  );

  return { rebuilding, error, lastResult, rebuild };
}

/**
 * Form-driven wrapper for the admin-tab placement: owns its own query +
 * targetEmail input state and submits on form-submit.
 */
export function useContactSearchDebug() {
  const [query, setQuery] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const { loading, error, result, run, runAgain } = useContactSearchDebugRunner();

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await run(query, targetEmail);
    },
    [query, targetEmail, run]
  );

  return {
    query,
    setQuery,
    targetEmail,
    setTargetEmail,
    loading,
    error,
    result,
    handleSubmit,
    runAgain,
  };
}
