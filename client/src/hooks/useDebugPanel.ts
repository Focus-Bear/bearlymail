import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';

import { SyncHistoryEntry } from 'components/inbox/debug/DebugSyncHistorySection';
import { DebugStarredData } from 'components/inbox/debug/types';
import { API_URL } from 'config/api';
import { useDebugViewOpen } from 'hooks/useDebugViewOpen';

interface SyncStatus {
  lastSyncTime: string | null;
  nextBatchDeliveryTime: string | null;
  deliverySchedule: {
    deliveryDays: number[];
    deliveryTimes: string[];
    timezone: string;
  } | null;
}

interface DebugOrphanData {
  totalEmailsInDb: number;
  emailsWithThreadId: number;
  orphanEmails: number;
  orphanEmailDetails: Array<{
    id: string;
    threadId: string;
    emailThreadId: string | null;
    subject: string;
    from: string;
    receivedAt: string;
  }>;
  threadsInDb: number;
  threadsWithoutEmails: Array<{
    id: string;
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }>;
}

export interface ThreadLookupResult {
  found: boolean;
  threadId: string;
  thread: {
    id: string;
    threadId: string;
    starCount: number;
    isArchived: boolean;
    priorityScore: number | null;
    updatedAt: string;
  } | null;
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    receivedAt: string;
    isSnoozed: boolean;
    snoozeUntil: string | null;
    isBatched: boolean;
    batchReleaseAt: string | null;
  }>;
  visibility: {
    wouldShowInTriage: boolean;
    wouldShowInAction: boolean;
    wouldShowInFollowUp: boolean;
  };
  reasons: string[];
  /** Present when the lookup was triggered from a Gmail URL with a URL-encoded ID */
  gmailApiResult?: {
    foundInGmailApi: boolean;
    apiMessageId: string | null;
    apiThreadId: string | null;
    subject: string | null;
    from: string | null;
    receivedAt: string | null;
    connectedEmail?: string | null;
    idsTried?: string[];
    attempts?: Array<{
      id: string;
      kind: 'message' | 'thread';
      success: boolean;
      errorCode?: number;
      errorMessage?: string;
    }>;
    error?: string;
  };
}

interface UseDebugPanelReturn {
  debugViewOpen: boolean;
  setDebugViewOpen: (value: boolean) => void;
  mainPanelCollapsed: boolean;
  setMainPanelCollapsed: (value: boolean) => void;
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
  syncHistory: SyncHistoryEntry[] | null;
  loadingSyncHistory: boolean;
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  fixingOrphans: boolean;
  threadLookupResult: ThreadLookupResult | null;
  loadingThreadLookup: boolean;
  allEmails: Email[];
  loadingAllEmails: boolean;
  fetchSyncStatus: () => Promise<void>;
  fetchSyncHistory: () => Promise<void>;
  fetchDebugStarredThreads: () => Promise<void>;
  fetchDebugOrphanEmails: () => Promise<void>;
  handleFixOrphanEmails: (onSuccess?: () => void) => Promise<void>;
  lookupThread: (threadId: string) => Promise<void>;
  fetchAllEmails: (mode: InboxMode) => Promise<void>;
}

async function fetchDebugEndpoint<T>(
  url: string,
  setLoading: (v: boolean) => void,
  setData: (v: T) => void,
  label: string
): Promise<void> {
  setLoading(true);
  try {
    const response = await axios.get(url);
    setData(response.data);
  } catch (error) {
    console.error(`Error fetching ${label}:`, error); // nosemgrep
  } finally {
    setLoading(false);
  }
}

/**
 * Manages orphan-email debug data: state, fetcher, and fix action.
 * Extracted from useDebugPanel to keep that hook under the max-lines-per-function limit.
 */
function useDebugOrphanData(onSuccess?: () => void) {
  const [debugOrphanData, setDebugOrphanData] = useState<DebugOrphanData | null>(null);
  const [loadingOrphanData, setLoadingOrphanData] = useState(false);
  const [fixingOrphans, setFixingOrphans] = useState(false);

  const fetchDebugOrphanEmails = useCallback(
    () =>
      fetchDebugEndpoint(
        `${API_URL}/emails/debug/orphan-emails`,
        setLoadingOrphanData,
        setDebugOrphanData,
        'orphan emails'
      ),
    []
  );

  const handleFixOrphanEmails = useCallback(
    async (onSuccessCallback?: () => void) => {
      setFixingOrphans(true);
      try {
        const response = await axios.post(`${API_URL}/emails/debug/fix-orphan-emails`);
        alert(`Fixed ${response.data.fixed} orphan emails. Errors: ${response.data.errors.length}`);
        fetchDebugOrphanEmails();
        onSuccessCallback?.();
        onSuccess?.();
      } catch (error) {
        console.error('Error fixing orphan emails:', error);
        alert('Failed to fix orphan emails');
      } finally {
        setFixingOrphans(false);
      }
    },
    [fetchDebugOrphanEmails, onSuccess]
  );

  return { debugOrphanData, loadingOrphanData, fixingOrphans, fetchDebugOrphanEmails, handleFixOrphanEmails };
}

/**
 * Manages thread-lookup debug state and action.
 * Extracted from useDebugPanel to keep that hook under the max-lines-per-function limit.
 */
function useDebugThreadLookup() {
  const [threadLookupResult, setThreadLookupResult] = useState<ThreadLookupResult | null>(null);
  const [loadingThreadLookup, setLoadingThreadLookup] = useState(false);

  const lookupThread = useCallback(async (threadId: string) => {
    if (!threadId.trim()) {
      return;
    }
    setLoadingThreadLookup(true);
    setThreadLookupResult(null);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/thread-lookup/${encodeURIComponent(threadId)}`);
      setThreadLookupResult(response.data);
    } catch (error) {
      console.error('Error looking up thread:', error);
      setThreadLookupResult({
        found: false,
        threadId,
        thread: null,
        emails: [],
        visibility: { wouldShowInTriage: false, wouldShowInAction: false, wouldShowInFollowUp: false },
        reasons: ['Error looking up thread - please check the thread ID and try again'],
      });
    } finally {
      setLoadingThreadLookup(false);
    }
  }, []);

  return { threadLookupResult, loadingThreadLookup, lookupThread };
}

/**
 * Manages "fetch all emails" debug state and action.
 * Extracted from useDebugPanel to keep that hook under the max-lines-per-function limit.
 */
function useDebugAllEmails() {
  const [allEmails, setAllEmails] = useState<Email[]>([]);
  const [loadingAllEmails, setLoadingAllEmails] = useState(false);

  const fetchAllEmails = useCallback(async (mode: InboxMode) => {
    setLoadingAllEmails(true);
    try {
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}&limit=1000&offset=0`);
      setAllEmails(response.data.emails || []);
    } catch (error) {
      console.error('Error fetching all emails for debug:', error);
      setAllEmails([]);
    } finally {
      setLoadingAllEmails(false);
    }
  }, []);

  return { allEmails, loadingAllEmails, fetchAllEmails };
}

export function useDebugPanel(onSuccess?: () => void): UseDebugPanelReturn {
  // debugViewOpen is the master "debug mode" switch (bug icon), persisted so it
  // applies across pages. mainPanelCollapsed only collapses this panel's body and
  // is independent of debug mode, so collapsing never exits debug mode.
  const { debugViewOpen, setDebugViewOpen } = useDebugViewOpen();
  const [mainPanelCollapsed, setMainPanelCollapsed] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[] | null>(null);
  const [loadingSyncHistory, setLoadingSyncHistory] = useState(false);
  const [debugStarredData, setDebugStarredData] = useState<DebugStarredData | null>(null);
  const [loadingDebugData, setLoadingDebugData] = useState(false);

  const fetchSyncStatus = useCallback(
    () => fetchDebugEndpoint(`${API_URL}/emails/debug/sync-status`, setLoadingSyncStatus, setSyncStatus, 'sync status'),
    []
  );
  const fetchSyncHistory = useCallback(
    () =>
      fetchDebugEndpoint(`${API_URL}/emails/debug/sync-history`, setLoadingSyncHistory, setSyncHistory, 'sync history'),
    []
  );
  const fetchDebugStarredThreads = useCallback(
    () =>
      fetchDebugEndpoint(
        `${API_URL}/emails/debug/starred-threads`,
        setLoadingDebugData,
        setDebugStarredData,
        'starred threads'
      ),
    []
  );

  useEffect(() => {
    if (debugViewOpen && !syncStatus && !loadingSyncStatus) {
      fetchSyncStatus();
    }
  }, [debugViewOpen, syncStatus, loadingSyncStatus, fetchSyncStatus]);

  const orphanData = useDebugOrphanData(onSuccess);
  const threadLookup = useDebugThreadLookup();
  const allEmailsData = useDebugAllEmails();

  return {
    debugViewOpen,
    setDebugViewOpen,
    mainPanelCollapsed,
    setMainPanelCollapsed,
    syncStatus,
    loadingSyncStatus,
    syncHistory,
    loadingSyncHistory,
    debugStarredData,
    loadingDebugData,
    fetchSyncStatus,
    fetchSyncHistory,
    fetchDebugStarredThreads,
    ...orphanData,
    ...threadLookup,
    ...allEmailsData,
  };
}
