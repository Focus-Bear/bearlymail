import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';
import { SyncHistoryEntry } from 'components/inbox/debug/DebugSyncHistorySection';
import { Email, InboxMode } from 'types/email';
import { DebugStarredData } from 'components/inbox/debug/types';

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
  };
}

interface UseDebugPanelReturn {
  debugViewOpen: boolean;
  setDebugViewOpen: React.Dispatch<React.SetStateAction<boolean>>;
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

export function useDebugPanel(onSuccess?: () => void): UseDebugPanelReturn {
  const [debugViewOpen, setDebugViewOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[] | null>(null);
  const [loadingSyncHistory, setLoadingSyncHistory] = useState(false);
  const [debugStarredData, setDebugStarredData] = useState<DebugStarredData | null>(null);
  const [loadingDebugData, setLoadingDebugData] = useState(false);
  const [debugOrphanData, setDebugOrphanData] = useState<DebugOrphanData | null>(null);
  const [loadingOrphanData, setLoadingOrphanData] = useState(false);
  const [fixingOrphans, setFixingOrphans] = useState(false);
  const [threadLookupResult, setThreadLookupResult] = useState<ThreadLookupResult | null>(null);
  const [loadingThreadLookup, setLoadingThreadLookup] = useState(false);
  const [allEmails, setAllEmails] = useState<Email[]>([]);
  const [loadingAllEmails, setLoadingAllEmails] = useState(false);

  const fetchSyncStatus = useCallback(async () => {
    setLoadingSyncStatus(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/sync-status`);
      setSyncStatus(response.data);
    } catch (error) {
      console.error('Error fetching sync status:', error);
    } finally {
      setLoadingSyncStatus(false);
    }
  }, []);

  // Auto-fetch sync status when debug panel opens
  useEffect(() => {
    if (debugViewOpen && !syncStatus && !loadingSyncStatus) {
      fetchSyncStatus();
    }
  }, [debugViewOpen, syncStatus, loadingSyncStatus, fetchSyncStatus]);

  const fetchSyncHistory = useCallback(async () => {
    setLoadingSyncHistory(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/sync-history`);
      setSyncHistory(response.data);
    } catch (error) {
      console.error('Error fetching sync history:', error);
    } finally {
      setLoadingSyncHistory(false);
    }
  }, []);

  const fetchDebugStarredThreads = useCallback(async () => {
    setLoadingDebugData(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/starred-threads`);
      setDebugStarredData(response.data);
    } catch (error) {
      console.error('Error fetching debug starred threads:', error);
    } finally {
      setLoadingDebugData(false);
    }
  }, []);

  const fetchDebugOrphanEmails = useCallback(async () => {
    setLoadingOrphanData(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/orphan-emails`);
      setDebugOrphanData(response.data);
    } catch (error) {
      console.error('Error fetching debug orphan emails:', error);
    } finally {
      setLoadingOrphanData(false);
    }
  }, []);

  const handleFixOrphanEmails = useCallback(async (onSuccessCallback?: () => void) => {
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
  }, [fetchDebugOrphanEmails, onSuccess]);

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
        visibility: {
          wouldShowInTriage: false,
          wouldShowInAction: false,
          wouldShowInFollowUp: false,
        },
        reasons: ['Error looking up thread - please check the thread ID and try again'],
      });
    } finally {
      setLoadingThreadLookup(false);
    }
  }, []);

  const fetchAllEmails = useCallback(async (mode: InboxMode) => {
    setLoadingAllEmails(true);
    try {
      // Fetch all emails for the current mode without pagination
      // Using a high limit to get all emails in one request
      const params = new URLSearchParams();
      params.append('mode', mode);
      params.append('limit', '1000');
      params.append('offset', '0');

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      setAllEmails(response.data.emails || []);
    } catch (error) {
      console.error('Error fetching all emails for debug:', error);
      setAllEmails([]);
    } finally {
      setLoadingAllEmails(false);
    }
  }, []);

  return {
    debugViewOpen,
    setDebugViewOpen,
    syncStatus,
    loadingSyncStatus,
    syncHistory,
    loadingSyncHistory,
    debugStarredData,
    loadingDebugData,
    debugOrphanData,
    loadingOrphanData,
    fixingOrphans,
    threadLookupResult,
    loadingThreadLookup,
    allEmails,
    loadingAllEmails,
    fetchSyncStatus,
    fetchSyncHistory,
    fetchDebugStarredThreads,
    fetchDebugOrphanEmails,
    handleFixOrphanEmails,
    lookupThread,
    fetchAllEmails,
  };
}



