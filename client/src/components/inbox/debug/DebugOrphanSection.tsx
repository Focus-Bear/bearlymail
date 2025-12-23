import React from 'react';
import { theme } from '../../../theme/theme';

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

interface DebugOrphanSectionProps {
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  onFetchDebugOrphan: () => void;
  fixingOrphans: boolean;
  onFixOrphans: () => void;
}

/**
 * Debug orphan section component
 * Displays orphan emails debug information
 */
export const DebugOrphanSection: React.FC<DebugOrphanSectionProps> = ({
  debugOrphanData,
  loadingOrphanData,
  onFetchDebugOrphan,
  fixingOrphans,
  onFixOrphans,
}) => {
  const getOrphanEmailKey = (email: DebugOrphanData['orphanEmailDetails'][0], index: number): string => {
    return `orphan-${email.id}-${index}`;
  };

  const getThreadKey = (thread: DebugOrphanData['threadsWithoutEmails'][0], index: number): string => {
    return `thread-${thread.id}-${index}`;
  };

  const getStatsBackgroundColor = (): string => {
    if (!debugOrphanData) return '#E8F4FD';
    return debugOrphanData.orphanEmails > 0 ? '#FFE6E6' : '#E8F4FD';
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
        <h4 style={{ margin: 0 }}>🔗 Orphan Emails Debug (emails without thread link)</h4>
        <button
          onClick={onFetchDebugOrphan}
          disabled={loadingOrphanData}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: loadingOrphanData ? 'not-allowed' : 'pointer',
            opacity: loadingOrphanData ? 0.6 : 1,
          }}
        >
          {loadingOrphanData ? 'Loading...' : 'Fetch Orphan Data'}
        </button>
      </div>

      {debugOrphanData && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: getStatsBackgroundColor(),
              borderRadius: theme.borderRadius.sm,
            }}
          >
            <div>
              <strong>Total Emails:</strong> {debugOrphanData.totalEmailsInDb}
            </div>
            <div>
              <strong>With Thread ID:</strong> {debugOrphanData.emailsWithThreadId}
            </div>
            <div
              style={{
                color: debugOrphanData.orphanEmails > 0 ? 'red' : 'green',
                fontWeight: 'bold',
              }}
            >
              <strong>Orphan Emails:</strong> {debugOrphanData.orphanEmails}
            </div>
            <div>
              <strong>Threads in DB:</strong> {debugOrphanData.threadsInDb}
            </div>
          </div>

          {debugOrphanData.orphanEmails > 0 && (
            <div style={{ marginBottom: theme.spacing.md }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  marginBottom: theme.spacing.sm,
                }}
              >
                <h5 style={{ margin: 0, color: 'red' }}>⚠️ Orphan Emails (no emailThreadId):</h5>
                <button
                  onClick={onFixOrphans}
                  disabled={fixingOrphans}
                  style={{
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.sm,
                    cursor: fixingOrphans ? 'not-allowed' : 'pointer',
                    opacity: fixingOrphans ? 0.6 : 1,
                  }}
                >
                  {fixingOrphans ? 'Fixing...' : '🔧 Fix Orphan Emails'}
                </button>
              </div>
              {debugOrphanData.orphanEmailDetails.slice(0, 10).map((email, index) => (
                <div
                  key={getOrphanEmailKey(email, index)}
                  style={{
                    padding: theme.spacing.sm,
                    backgroundColor: '#FFE6E6',
                    border: '1px solid #F5C6CB',
                    borderRadius: theme.borderRadius.sm,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  <div>
                    <strong>Email ID:</strong> {email.id} | <strong>Gmail Thread:</strong>{' '}
                    {email.threadId} | <strong>DB Thread:</strong> {email.emailThreadId || 'NULL'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      color: theme.colors.text.secondary,
                    }}
                  >
                    {email.from}: {email.subject}
                  </div>
                </div>
              ))}
              {debugOrphanData.orphanEmailDetails.length > 10 && (
                <div style={{ color: theme.colors.text.secondary, fontStyle: 'italic' }}>
                  ... and {debugOrphanData.orphanEmailDetails.length - 10} more
                </div>
              )}
            </div>
          )}

          {debugOrphanData.threadsWithoutEmails.length > 0 && (
            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  marginBottom: theme.spacing.sm,
                  color: 'orange',
                }}
              >
                ⚠️ Threads Without Emails ({debugOrphanData.threadsWithoutEmails.length})
              </summary>
              {debugOrphanData.threadsWithoutEmails.map((thread, index) => (
                <div
                  key={getThreadKey(thread, index)}
                  style={{
                    padding: theme.spacing.sm,
                    backgroundColor: theme.colors.sunray.light3,
                    border: '1px solid #FFEEBA',
                    borderRadius: theme.borderRadius.sm,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  <span>
                    <strong>DB ID:</strong> {thread.id} | <strong>Gmail Thread:</strong>{' '}
                    {thread.threadId} | <strong>Stars:</strong> {thread.starCount} |{' '}
                    <strong>Archived:</strong> {thread.isArchived ? 'YES' : 'NO'}
                  </span>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
};

