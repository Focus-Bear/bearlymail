export interface DebugStarredData {
  // Optional Gmail error (e.g. auth expired)
  gmailError?: string;
  // Aggregate counts
  summary: {
    gmailStarredCount: number; // threads matching "is:starred in:inbox" in Gmail
    foundInDb: number; // how many of those are in our DB
    notInDb: number; // how many are missing from DB
    inActionOrFollowUp: number; // how many appear in Action/Follow-up tab
    starredInDbButHidden: number; // in DB with starCount>0 but blocked/snoozed/batched
    notStarredInDb: number; // in DB but starCount=0
    archivedInBearlyMail?: number; // in DB and isArchived=true
    archiveConflicts?: number; // archived in BM but Gmail says still in INBOX (syncStatus=synced)
  };
  // Per-thread breakdown (Gmail's perspective — not just DB-starred ones)
  threads: Array<{
    threadId: string;
    subject: string | null;
    inDb: boolean;
    isStarredInDb: boolean;
    category: string | null;
    appearsInActionOrFollowUp: boolean;
    reason: string; // human-readable reason code from EmailDebugService
    // Archive trust fields (Phase 3)
    isArchivedInDb?: boolean;
    isInGmailInbox?: boolean;
    syncStatus?: 'synced' | 'unsynced';
    hasUnsyncedChanges?: boolean;
    archiveStatusConflict?: boolean; // archived in BM but Gmail says INBOX, and syncStatus=synced
  }>;
  // Re-added by server: syncStatus='unsynced' for >5 min (needed by Fix Stale button)
  staleUnsyncedThreads?: Array<{
    threadId: string;
    syncStatusUpdatedAt: string | null;
    minutesUnsynced: number;
    isArchived: boolean;
    starCount: number;
  }>;
}
