import { useEffect, useRef } from 'react';
import { InboxMode } from '../types/email';

interface UseInboxModeChangesProps {
  mode: InboxMode;
  hasInitiallyLoaded: boolean;
  user: any;
  authLoading: boolean;
  fetchEmails: () => Promise<void>;
  fetchBatchStatus: () => Promise<void>;
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
    Promise.all([
      fetchEmails().catch(err => console.error('Error fetching emails on mode change:', err)),
      fetchBatchStatus().catch(err => console.error('Error fetching batch status on mode change:', err))
    ]).finally(() => {
      setLoadingModeSwitch(false);
    });
    // Note: fetchEmails is intentionally not in dependencies - we track mode changes directly
    // fetchEmails uses mode from its closure, so it will use the current mode when called
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasInitiallyLoaded, user, authLoading]);

  // Fetch triage suggestions when in triage mode with emails
  useEffect(() => {
    const modeChanged = prevModeRef.current !== mode;
    const emailsChanged = prevEmailsLengthRef.current !== emails.length;
    
    if (mode === 'triage' && emails.length > 0 && !loadingSuggestions && (modeChanged || emailsChanged)) {
      fetchTriageSuggestions(emails);
      prevModeRef.current = mode;
      prevEmailsLengthRef.current = emails.length;
    } else if (mode !== 'triage') {
      prevModeRef.current = mode;
      clearSuggestionsCache();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emails.length, loadingSuggestions]);
}



