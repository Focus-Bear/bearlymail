import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_ERROR_WEB, COLOR_WHITE } from 'constants/colors';
import { HOURS_PER_DAY, MINUTES_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

export interface SyncHistoryEntry {
  id: string;
  syncedAt: string;
  completedAt: string | null;
  provider: string;
  syncWindowStart: string | null;
  queries: string[];
  threadsFound: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  isContinuation: boolean;
}

interface DebugSyncHistorySectionProps {
  syncHistory: SyncHistoryEntry[] | null;
  loadingSyncHistory: boolean;
  onFetchSyncHistory: () => void;
}

const rowStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} 0`,
  borderBottom: '1px solid #e0e0e0',
};

const labelStyle: React.CSSProperties = {
  fontWeight: 'bold',
  color: theme.colors.text.secondary,
  marginRight: theme.spacing.xs,
};

const queryBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#e8f4fd',
  border: '1px solid #BEE5EB',
  borderRadius: '3px',
  padding: '1px 4px',
  margin: '2px 2px 2px 0',
  wordBreak: 'break-all',
  fontSize: '0.6rem',
};

const errorBadgeStyle: React.CSSProperties = {
  background: '#fde8e8',
  border: '1px solid #f5c6cb',
  borderRadius: '3px',
  padding: '1px 4px',
  color: COLOR_ERROR_WEB,
  fontSize: '0.6rem',
};

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  if (ms < MS_PER_SECOND) {
    return `${ms}ms`;
  }
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < MINUTES_PER_HOUR) {
    return `${diffMins}m ago`;
  }
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
  if (diffHours < HOURS_PER_DAY) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
  return `${diffDays}d ago`;
}

/**
 * Debug sync history section – shows recent sync attempts with their Gmail search queries.
 */
export const DebugSyncHistorySection: React.FC<DebugSyncHistorySectionProps> = ({
  syncHistory,
  loadingSyncHistory,
  onFetchSyncHistory,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: COLOR_WHITE,
        borderRadius: theme.borderRadius.sm,
        border: '1px solid #dee2e6',
      }}
    >
      <h4 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>{t('debug.syncHistory.sectionTitle')}</h4>

      {!syncHistory && !loadingSyncHistory && (
        <button
          onClick={onFetchSyncHistory}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            background: theme.colors.primary.main,
            color: COLOR_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {t('debug.syncHistory.fetchButton')}
        </button>
      )}

      {loadingSyncHistory && <div style={{ color: theme.colors.text.secondary }}>{t('debug.stats.loading')}</div>}

      {syncHistory && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.spacing.xs,
            }}
          >
            <span style={{ color: theme.colors.text.secondary, fontSize: '0.65rem' }}>
              {t('debug.syncHistory.showingLast', { count: syncHistory.length })}
            </span>
            <button
              onClick={onFetchSyncHistory}
              style={{
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid #adb5bd',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.6rem',
              }}
            >
              {t('debug.syncHistory.refreshButton')}
            </button>
          </div>

          {syncHistory.length === 0 && (
            <div style={{ color: theme.colors.text.secondary }}>{t('debug.syncHistory.noHistory')}</div>
          )}

          {syncHistory.map(entry => (
            <div key={entry.id} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontWeight: 'bold', color: entry.errorMessage ? '#dc3545' : '#28a745' }}>
                  {formatRelative(entry.syncedAt)}
                  {entry.isContinuation && (
                    <span
                      style={{
                        marginLeft: '4px',
                        fontSize: '0.55rem',
                        background: '#e9ecef',
                        borderRadius: '3px',
                        padding: '1px 3px',
                      }}
                    >
                      {t('debug.syncHistory.continuation')}
                    </span>
                  )}
                </span>
                <span style={{ color: theme.colors.text.secondary, fontSize: '0.6rem' }}>
                  {t('debug.syncHistory.threads', { count: entry.threadsFound ?? 0 })}
                  {' · '}
                  {formatDuration(entry.durationMs)}
                </span>
              </div>

              {entry.syncWindowStart && (
                <div style={{ fontSize: '0.6rem', color: theme.colors.text.secondary, marginBottom: '2px' }}>
                  <span style={labelStyle}>{t('debug.syncHistory.windowStart')}:</span>
                  {new Date(entry.syncWindowStart).toLocaleString()}
                </div>
              )}

              {entry.queries.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  <span style={{ ...labelStyle, fontSize: '0.6rem' }}>{t('debug.syncHistory.queries')}:</span>
                  <div>
                    {entry.queries.map(query => (
                      <span key={query} style={queryBadgeStyle}>
                        {query}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {entry.errorMessage && (
                <div style={{ marginTop: '2px' }}>
                  <span style={errorBadgeStyle}>{entry.errorMessage}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};
