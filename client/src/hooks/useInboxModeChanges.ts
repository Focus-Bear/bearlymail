import { useEffect, useRef } from 'react';
import { Email, InboxMode } from 'types/email';
import { clearCacheForMode } from 'utils/emailCache';

import { MODE_TRIAGE } from 'constants/strings';
import { User } from 'contexts/AuthContext';
import { InboxFilter } from 'hooks/useInboxFilters';

interface UseInboxModeChangesProps {
  mode: InboxMode;
  hasInitiallyLoaded: boolean;
  user: User | null;
  authLoading: boolean;
  fetchEmails: (
    signalOrOverride?: AbortSignal | Partial<InboxFilter>,
    overrideFilters?: Partial<InboxFilter>
  ) => Promise<void>;
  fetchBatchStatus: (signal?: AbortSignal) => Promise<void>;
  fetchTabCounts: (force?: boolean, filters?: Partial<InboxFilter> | null, signal?: AbortSignal) => Promise<void>;
  filters?: Partial<InboxFilter> | null;
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  setLoadingModeSwitch: (loading: boolean) => void;
  clearSuggestionsCache: () => void;
  fetchTriageSuggestions: (emails: Email[]) => void;
  emails: Email[];
  loadingSuggestions: boolean;
}

export function useInboxModeChanges({
  mode,
  hasInitiallyLoaded,
  user,
  authLoading,
  fetchEmails,
  fetchBatchStatus,
  fetchTabCounts,
  filters,
  setEmails,
  setLoadingModeSwitch,
  clearSuggestionsCache,
  fetchTriageSuggestions,
  emails,
  loadingSuggestions,
}: UseInboxModeChangesProps) {
  const prevModeForFetchRef = useRef<InboxMode | null>(null);
  const hasSetInitialModeRef = useRef(false);
  const prevModeRef = useRef<InboxMode | null>(null);
  const prevEmailsLengthRef = useRef<number>(0);

  // Re-fetch when mode changes (after initial load)
  useEffect(() => {
    if (!hasInitiallyLoaded || !user || authLoading) {
      return;
    }

    // On first run after initial load, just record the initial mode and don't fetch.
    // useInboxInitialization already handles the initial fetchEmails/fetchBatchStatus/
    // fetchTabCounts calls — duplicating them here would cause duplicate requests.
    if (!hasSetInitialModeRef.current) {
      prevModeForFetchRef.current = mode;
      hasSetInitialModeRef.current = true;
      return;
    }

    // Only fetch if mode actually changed since the last fetch
    if (prevModeForFetchRef.current === mode) {
      return;
    }

    // Update the previous mode before fetching (so we don't refetch if effect runs again)
    prevModeForFetchRef.current = mode;

    // Clear localStorage cache for the new mode so stale data from a previous visit
    // is not served by stale-while-revalidate logic. Mode switches always need fresh data.
    clearCacheForMode(mode);

    setEmails([]);
    setLoadingModeSwitch(true);
    clearSuggestionsCache();

    // Force refresh tab counts to ensure they're in sync with the inbox data
    Promise.all([
      fetchEmails().catch(err => console.error('Error fetching emails on mode change:', err)),
      fetchBatchStatus().catch(err => console.error('Error fetching batch status on mode change:', err)),
      fetchTabCounts(true, filters).catch(err => console.error('Error fetching tab counts on mode change:', err)),
    ]).finally(() => {
      setLoadingModeSwitch(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing
  }, [mode, hasInitiallyLoaded, user, authLoading, fetchEmails]);

  // Fetch triage suggestions when in triage mode with emails
  useEffect(() => {
    const modeChanged = prevModeRef.current !== mode;
    const emailsChanged = prevEmailsLengthRef.current !== emails.length;

    if (mode === MODE_TRIAGE && emails.length > 0 && !loadingSuggestions && (modeChanged || emailsChanged)) {
      fetchTriageSuggestions(emails);
      prevModeRef.current = mode;
      prevEmailsLengthRef.current = emails.length;
    } else if (mode !== MODE_TRIAGE) {
      prevModeRef.current = mode;
      clearSuggestionsCache();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing
  }, [mode, emails.length, loadingSuggestions]);
}
