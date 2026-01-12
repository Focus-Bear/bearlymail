import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

interface SyncStatus {
  lastSyncTime: string | null;
  nextBatchDeliveryTime: string | null;
  deliverySchedule: {
    deliveryDays: number[];
    deliveryTimes: string[];
    timezone: string;
  } | null;
}

interface DebugStarredData {
  lastSyncTime: string | null;
  gmail: {
    starredThreadCount: number;
    starredThreadIds: string[];
    error?: string;
  };
  database: {
    starredThreadCount: number;
    starredEmailCount: number;
  };
  actionTabResults: number;
  comparison: {
    inGmailNotInDb: string[];
    inDbNotInGmail: string[];
    inDbButArchived: string[];
  };
  starredThreads: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
    isSnoozed: boolean;
    emailCount: number;
    latestSubject: string;
    latestFrom: string;
    issues: string[];
    inGmail: boolean;
    lastCheckedAt: string | null;
  }>;
  missingFromProcessTab: Array<{
    threadId: string;
    reason: string;
    details: any;
  }>;
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

interface UseDebugPanelReturn {
  debugViewOpen: boolean;
  setDebugViewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  fixingOrphans: boolean;
  fetchSyncStatus: () => Promise<void>;
  fetchDebugStarredThreads: () => Promise<void>;
  fetchDebugOrphanEmails: () => Promise<void>;
  handleFixOrphanEmails: (onSuccess?: () => void) => Promise<void>;
}

export function useDebugPanel(onSuccess?: () => void): UseDebugPanelReturn {
  const [debugViewOpen, setDebugViewOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [debugStarredData, setDebugStarredData] = useState<DebugStarredData | null>(null);
  const [loadingDebugData, setLoadingDebugData] = useState(false);
  const [debugOrphanData, setDebugOrphanData] = useState<DebugOrphanData | null>(null);
  const [loadingOrphanData, setLoadingOrphanData] = useState(false);
  const [fixingOrphans, setFixingOrphans] = useState(false);

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

  return {
    debugViewOpen,
    setDebugViewOpen,
    syncStatus,
    loadingSyncStatus,
    debugStarredData,
    loadingDebugData,
    debugOrphanData,
    loadingOrphanData,
    fixingOrphans,
    fetchSyncStatus,
    fetchDebugStarredThreads,
    fetchDebugOrphanEmails,
    handleFixOrphanEmails,
  };
}



