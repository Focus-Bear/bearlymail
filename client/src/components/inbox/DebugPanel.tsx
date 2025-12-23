import React from 'react';
import { theme } from '../../theme/theme';
import { Email } from '../../types/email';
import {
  DebugStatsSection,
  DebugStarredSection,
  DebugOrphanSection,
  DebugEmailList,
} from './debug';

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

interface SyncStatus {
  lastSyncTime: string | null;
  nextBatchDeliveryTime: string | null;
  deliverySchedule: {
    deliveryDays: number[];
    deliveryTimes: string[];
    timezone: string;
  } | null;
}

interface DebugPanelProps {
  mode: 'triage' | 'action' | 'follow-up';
  emails: Email[];
  isOpen: boolean;
  onToggle: () => void;
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  onFetchDebugStarred: () => void;
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  onFetchDebugOrphan: () => void;
  fixingOrphans: boolean;
  onFixOrphans: () => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  mode,
  emails,
  isOpen,
  onToggle,
  syncStatus,
  loadingSyncStatus,
  debugStarredData,
  loadingDebugData,
  onFetchDebugStarred,
  debugOrphanData,
  loadingOrphanData,
  onFetchDebugOrphan,
  fixingOrphans,
  onFixOrphans,
}) => {
  const threadCount = (() => {
    const visibleEmails = emails.filter(e => !e.isArchived);
    const filteredByMode = mode === 'action' || mode === 'follow-up'
      ? visibleEmails.filter(e => (e.starCount ?? 0) > 0)
      : visibleEmails.filter(e => (e.starCount ?? 0) === 0);
    const uniqueThreads = new Set(filteredByMode.map(e => e.threadId));
    return uniqueThreads.size;
  })();

  return (
    <div style={{
      margin: theme.spacing.md,
      border: '2px solid #FFC107',
      borderRadius: theme.borderRadius.md,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: theme.spacing.md,
          backgroundColor: theme.colors.sunray.light3,
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontWeight: theme.typography.fontWeight.bold,
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>🐛 DEBUG VIEW - Mode: {mode} | Total Threads: {threadCount} | Thread-Based Fetching</span>
        <span style={{ fontSize: theme.typography.fontSize.lg }}>
          {isOpen ? '▼' : '▶'}
        </span>
      </button>
      {isOpen && (
        <div style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.sunray.light3,
          fontSize: theme.typography.fontSize.xs,
          fontFamily: 'monospace',
          maxHeight: '600px',
          overflowY: 'auto',
        }}>
          {/* Sync Status Section */}
          <div
            style={{
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: '#E8F4FD',
              borderRadius: theme.borderRadius.sm,
              border: '1px solid #BEE5EB',
            }}
          >
            <h4 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>🔄 Sync Status</h4>
            <DebugStatsSection
              syncStatus={syncStatus}
              loadingSyncStatus={loadingSyncStatus}
            />
          </div>

          <DebugStarredSection
            debugStarredData={debugStarredData}
            loadingDebugData={loadingDebugData}
            onFetchDebugStarred={onFetchDebugStarred}
          />

          <DebugOrphanSection
            debugOrphanData={debugOrphanData}
            loadingOrphanData={loadingOrphanData}
            onFetchDebugOrphan={onFetchDebugOrphan}
            fixingOrphans={fixingOrphans}
            onFixOrphans={onFixOrphans}
          />

          <DebugEmailList emails={emails} mode={mode} />
        </div>
      )}
    </div>
  );
};
