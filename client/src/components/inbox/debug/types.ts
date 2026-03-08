export interface DebugStarredData {
  lastSyncTime: string | null;
  gmail: {
    starredThreadCount: number;
    starredEmailCount: number;
    starredThreadIds: string[];
    error?: string;
  };
  database: {
    starredThreadCount: number;
    starredEmailCount: number;
  };
  actionTabResults: number;
  comparison?: {
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
    syncStatus: 'synced' | 'unsynced';
    lastCheckedAt?: string | null;
  }>;
  missingFromProcessTab: Array<{
    threadId: string;
    reason: string;
    details: any;
  }>;
  gmailVisibilityChecks: Array<{
    threadId: string;
    inDatabase: boolean;
    visibleInAction: boolean;
    syncStatus: 'synced' | 'unsynced' | 'missing';
    reasons: string[];
  }>;
  staleUnsyncedThreads: Array<{
    threadId: string;
    syncStatusUpdatedAt: string | null;
    minutesUnsynced: number;
    isArchived: boolean;
    starCount: number;
  }>;
}
