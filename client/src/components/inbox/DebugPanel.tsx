import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';

import {
  DebugCategorySummarySection,
  DebugEmailList,
  DebugOrphanSection,
  DebugPrioritySection,
  DebugStarredSection,
  DebugStatsSection,
  DebugSyncHistorySection,
  DebugThreadLookupSection,
} from 'components/inbox/debug';
import { SyncHistoryEntry } from 'components/inbox/debug/DebugSyncHistorySection';
import { DebugStarredData } from 'components/inbox/debug/types';
import { COLOR_BG_INFO, COLOR_INFO_BLUE_LIGHT, COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_BUG, EMOJI_SYNC } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { MODE_ACTION, MODE_FOLLOW_UP, STRING_NONE } from 'constants/strings';
import { ThreadLookupResult } from 'hooks/useDebugPanel';
import type { InboxFilter } from 'hooks/useInboxFilters';
import { CategorySummaryItem } from 'store/slices/emailSlice';

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
  mode: InboxMode;
  emails: Email[];
  allEmails: Email[];
  loadingAllEmails: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onFetchAllEmails: () => void;
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
  syncHistory: SyncHistoryEntry[] | null;
  loadingSyncHistory: boolean;
  onFetchSyncHistory: () => void;
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  onFetchDebugStarred: () => Promise<void>;
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  onFetchDebugOrphan: () => void;
  fixingOrphans: boolean;
  onFixOrphans: () => void;
  threadLookupResult: ThreadLookupResult | null;
  loadingThreadLookup: boolean;
  onLookupThread: (threadId: string) => void;
  categorySummary?: CategorySummaryItem[] | null;
  loadedCategoryNames?: string[];
  loadingCategoryNames?: string[];
  expandedCategories?: Set<string>;
  /** Fix #1571 Item 3: current filter state for the priority debug section. */
  filters?: InboxFilter;
  /** Fix #1571 Item 3: computed priorityTotalCount from Inbox.tsx bucket overlap logic. */
  priorityTotalCount?: number;
}
export const DebugPanel: React.FC<DebugPanelProps> = ({
  mode,
  emails,
  allEmails,
  loadingAllEmails,
  isOpen,
  onToggle,
  onFetchAllEmails,
  syncStatus,
  loadingSyncStatus,
  syncHistory,
  loadingSyncHistory,
  onFetchSyncHistory,
  debugStarredData,
  loadingDebugData,
  onFetchDebugStarred,
  debugOrphanData,
  loadingOrphanData,
  onFetchDebugOrphan,
  fixingOrphans,
  onFixOrphans,
  threadLookupResult,
  loadingThreadLookup,
  onLookupThread,
  categorySummary,
  loadedCategoryNames,
  loadingCategoryNames,
  expandedCategories,
  filters,
  priorityTotalCount,
}) => {
  const { t } = useTranslation();
  const threadCount = (() => {
    const visibleEmails = emails.filter(event => !event.isArchived);
    const filteredByMode =
      mode === MODE_ACTION || mode === MODE_FOLLOW_UP
        ? visibleEmails.filter(event => (event.starCount ?? 0) > 0)
        : visibleEmails.filter(event => (event.starCount ?? 0) === 0);
    const uniqueThreads = new Set(filteredByMode.map(event => event.threadId));
    return uniqueThreads.size;
  })();

  return (
    <div
      style={{
        margin: theme.spacing.md,
        border: '2px solid #FFC107',
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: theme.spacing.md,
          backgroundColor: theme.colors.sunray.light3,
          border: STRING_NONE,
          textAlign: 'left',
          cursor: 'pointer',
          fontWeight: theme.typography.fontWeight.bold,
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          {EMOJI_BUG} {t('debug.panel.title', { mode, count: threadCount })}
        </span>
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.sunray.light3,
            fontSize: theme.typography.fontSize.xs,
            fontFamily: 'monospace',
            maxHeight: 'calc(100vh - 300px)',
            minHeight: '400px',
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {/* Sync Status Section */}
          <div
            style={{
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: COLOR_INFO_BLUE_LIGHT,
              borderRadius: theme.borderRadius.sm,
              border: '1px solid #BEE5EB',
            }}
          >
            <h4 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>
              {EMOJI_SYNC} {t('debug.panel.syncStatus')}
            </h4>
            <DebugStatsSection syncStatus={syncStatus} loadingSyncStatus={loadingSyncStatus} />
          </div>

          <DebugSyncHistorySection
            syncHistory={syncHistory}
            loadingSyncHistory={loadingSyncHistory}
            onFetchSyncHistory={onFetchSyncHistory}
          />

          <DebugCategorySummarySection
            categorySummary={categorySummary ?? null}
            loadedCategoryNames={loadedCategoryNames ?? []}
            loadingCategoryNames={loadingCategoryNames ?? []}
            expandedCategories={expandedCategories ?? new Set()}
            emails={emails}
            mode={mode}
          />

          {/* Fix #1571 Item 3: Priority debug section */}
          <DebugPrioritySection filters={filters} priorityTotalCount={priorityTotalCount} />

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

          <DebugThreadLookupSection
            threadLookupResult={threadLookupResult}
            loadingThreadLookup={loadingThreadLookup}
            onLookupThread={onLookupThread}
          />

          <div
            style={{
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: COLOR_BG_INFO,
              borderRadius: theme.borderRadius.sm,
              border: '1px solid #FFE082',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: theme.spacing.sm,
              }}
            >
              <h4 style={{ margin: 0 }}>
                📧 {t('debug.panel.allEmails')} ({allEmails.length > 0 ? allEmails.length : emails.length})
              </h4>
              <button
                onClick={onFetchAllEmails}
                disabled={loadingAllEmails}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: theme.colors.primary.main,
                  color: COLOR_NAMED_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.sm,
                  cursor: loadingAllEmails ? 'not-allowed' : 'pointer',
                  opacity: loadingAllEmails ? OPACITY_DISABLED : OPACITY_FULL,
                  fontSize: theme.typography.fontSize.xs,
                }}
              >
                {loadingAllEmails ? t('common.loading') : t('debug.panel.loadAllEmails')}
              </button>
            </div>
            {loadingAllEmails ? (
              <div style={{ color: theme.colors.text.secondary, padding: theme.spacing.sm }}>
                {t('debug.panel.loadingAllEmails')}
              </div>
            ) : (
              <DebugEmailList emails={allEmails.length > 0 ? allEmails : emails} mode={mode} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
