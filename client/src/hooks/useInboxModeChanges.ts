import { useEffect, useRef } from 'react';
import { InboxMode } from 'types/email';

import { MODE_TRIAGE } from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';

interface UseInboxModeChangesProps {
  mode: InboxMode;
  hasInitiallyLoaded: boolean;
  user: any;
  authLoading: boolean;
  fetchEmails: () => Promise<void>;
  fetchBatchStatus: () => Promise<void>;
  fetchTabCounts: (force?: boolean, filters?: Partial<InboxFilter> | null) => Promise<void>;
  filters?: Partial<InboxFilter> | null;
  setEmails: React.Dispatch<React.SetStateAction<any[]>>;
  setLoadingModeSwitch: (loading: boolean) => void;
  clearSuggestionsCache: () => void;
  fetchTriageSuggestions: (emails: any[]) => void;
  emails: any[];
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

    // On first run after initial load, just record the initial mode and don't fetch
    if (!hasSetInitialModeRef.current) {
      prevModeForFetchRef.current = mode;
      hasSetInitialModeRef.current = true;
      return;
    }

    // Only fetch if mode actually changed
    if (prevModeForFetchRef.current === mode) {
      return;
    }

    // Update the previous mode before fetching (so we don't refetch if effect runs again)
    prevModeForFetchRef.current = mode;

    setEmails([]);
    setLoadingModeSwitch(true);
    clearSuggestionsCache();

    // fetchEmails uses mode from its closure, so it will use the current mode value
    // Force refresh tab counts to ensure they're in sync with the inbox data
    Promise.all([
      fetchEmails().catch(err => console.error('Error fetching emails on mode change:', err)),
      fetchBatchStatus().catch(err => console.error('Error fetching batch status on mode change:', err)),
      fetchTabCounts(true, filters).catch(err => console.error('Error fetching tab counts on mode change:', err)),
    ]).finally(() => {
      setLoadingModeSwitch(false);
    });
    // Note: fetchEmails is intentionally not in dependencies - we track mode changes directly
    // fetchEmails uses mode from its closure, so it will use the current mode when called
  }, [mode, hasInitiallyLoaded, user, authLoading]);

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
  }, [mode, emails.length, loadingSuggestions]);
}
