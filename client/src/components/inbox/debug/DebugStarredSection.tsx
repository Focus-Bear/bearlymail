import React from 'react';
import { theme } from '../../../theme/theme';

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
    lastCheckedAt?: string | null;
  }>;
  missingFromProcessTab: Array<{
    threadId: string;
    reason: string;
    details: any;
  }>;
}

interface DebugStarredSectionProps {
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  onFetchDebugStarred: () => void;
}

/**
 * Debug starred section component
 * Displays starred threads debug information
 */
export const DebugStarredSection: React.FC<DebugStarredSectionProps> = ({
  debugStarredData,
  loadingDebugData,
  onFetchDebugStarred,
}) => {
  const getMissingItemKey = (item: DebugStarredData['missingFromProcessTab'][0], index: number): string => {
    return `missing-${item.threadId}-${index}`;
  };

  const getThreadKey = (thread: DebugStarredData['starredThreads'][0], index: number): string => {
    return `thread-${thread.threadId}-${index}`;
  };

  const getBackgroundColor = (hasIssues: boolean): string => {
    if (hasIssues) return '#FFE6E6';
    return '#D4EDDA';
  };

  const getBorderColor = (hasIssues: boolean): string => {
    if (hasIssues) return '#F5C6CB';
    return '#C3E6CB';
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: '#fff',
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        <h4 style={{ margin: 0 }}>🔍 Missing Starred Threads Debug</h4>
        <button
          onClick={onFetchDebugStarred}
          disabled={loadingDebugData}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: loadingDebugData ? 'not-allowed' : 'pointer',
            opacity: loadingDebugData ? 0.6 : 1,
          }}
        >
          {loadingDebugData ? 'Loading...' : 'Fetch Debug Data'}
        </button>
      </div>

      {debugStarredData && (
        <div>
          {/* Gmail vs DB Comparison */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.md,
            }}
          >
            <div
              style={{
                padding: theme.spacing.sm,
                backgroundColor: '#E8F4FD',
                borderRadius: theme.borderRadius.sm,
              }}
            >
              <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>📧 Gmail (is:starred is:inbox)</h5>
              {debugStarredData.gmail.error ? (
                <div style={{ color: 'red' }}>Error: {debugStarredData.gmail.error}</div>
              ) : (
                <div>
                  <strong>{debugStarredData.gmail.starredThreadCount}</strong> starred threads
                </div>
              )}
            </div>
            <div
              style={{
                padding: theme.spacing.sm,
                backgroundColor: '#E8F4FD',
                borderRadius: theme.borderRadius.sm,
              }}
            >
              <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>🗄️ Database</h5>
              <div>
                <strong>{debugStarredData.database.starredThreadCount}</strong> starred threads
              </div>
              <div>
                <strong>{debugStarredData.database.starredEmailCount}</strong> starred emails
              </div>
            </div>
          </div>

          {/* Comparison Results */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.sunray.light3,
              borderRadius: theme.borderRadius.sm,
            }}
          >
            <div
              style={{
                color: debugStarredData.comparison.inGmailNotInDb.length > 0 ? 'red' : 'green',
              }}
            >
              <strong>In Gmail, not in DB:</strong> {debugStarredData.comparison.inGmailNotInDb.length}
              {debugStarredData.comparison.inGmailNotInDb.length > 0 && (
                <div style={{ fontSize: '0.6rem' }}>
                  {debugStarredData.comparison.inGmailNotInDb.join(', ')}
                </div>
              )}
            </div>
            <div
              style={{
                color: debugStarredData.comparison.inDbNotInGmail.length > 0 ? 'orange' : 'green',
              }}
            >
              <strong>In DB, not in Gmail:</strong> {debugStarredData.comparison.inDbNotInGmail.length}
              {debugStarredData.comparison.inDbNotInGmail.length > 0 && (
                <div style={{ fontSize: '0.6rem' }}>
                  {debugStarredData.comparison.inDbNotInGmail.join(', ')}
                </div>
              )}
            </div>
            <div>
              <strong>Action Tab Results:</strong> {debugStarredData.actionTabResults}
            </div>
          </div>

          {debugStarredData.missingFromProcessTab.length > 0 && (
            <div style={{ marginBottom: theme.spacing.md }}>
              <h5 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: 'red' }}>
                ⚠️ Missing from Action Tab:
              </h5>
              {debugStarredData.missingFromProcessTab.map((item, index) => (
                <div
                  key={getMissingItemKey(item, index)}
                  style={{
                    padding: theme.spacing.sm,
                    backgroundColor: '#FFE6E6',
                    border: '1px solid #F5C6CB',
                    borderRadius: theme.borderRadius.sm,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  <div>
                    <strong>Thread:</strong> {item.threadId}
                  </div>
                  <div>
                    <strong>Reason:</strong> <span style={{ color: 'red' }}>{item.reason}</span>
                  </div>
                  <div>
                    <strong>Details:</strong> Stars: {item.details.starCount} | Emails:{' '}
                    {item.details.emailCount} | In Gmail: {item.details.inGmail ? '✅' : '❌'} |
                    Subject: {item.details.subject}
                  </div>
                </div>
              ))}
            </div>
          )}

          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 'bold',
                marginBottom: theme.spacing.sm,
              }}
            >
              All Starred Threads in DB ({debugStarredData.starredThreads.length})
            </summary>
            {debugStarredData.starredThreads.map((thread, index) => (
              <div
                key={getThreadKey(thread, index)}
                style={{
                  padding: theme.spacing.sm,
                  backgroundColor: getBackgroundColor(thread.issues.length > 0),
                  border: `1px solid ${getBorderColor(thread.issues.length > 0)}`,
                  borderRadius: theme.borderRadius.sm,
                  marginBottom: theme.spacing.xs,
                }}
              >
                <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
                  <span>
                    <strong>Thread:</strong> {thread.threadId}
                  </span>
                  <span>
                    <strong>Stars:</strong> {'⭐'.repeat(thread.starCount)}
                  </span>
                  <span>
                    <strong>Emails:</strong> {thread.emailCount}
                  </span>
                  <span>
                    <strong>Archived:</strong> {thread.isArchived ? '❌ YES' : '✅ NO'}
                  </span>
                  <span>
                    <strong>In Gmail:</strong> {thread.inGmail ? '✅' : '❌'}
                  </span>
                  {thread.lastCheckedAt && (
                    <span>
                      <strong>Last checked:</strong> {new Date(thread.lastCheckedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: theme.colors.text.secondary,
                    marginTop: '2px',
                  }}
                >
                  {thread.latestFrom}: {thread.latestSubject}
                </div>
                {thread.issues.length > 0 && (
                  <div style={{ color: 'red', marginTop: '4px' }}>
                    <strong>Issues:</strong> {thread.issues.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </details>
        </div>
      )}
    </div>
  );
};

