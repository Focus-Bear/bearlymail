import React from 'react';
import { theme } from '../../theme/theme';
import { Email } from '../../types/email';

interface DebugStarredData {
  gmail: {
    starredThreadCount: number;
    starredThreadIds: string[];
    error?: string;
  };
  database: {
    starredThreadCount: number;
    starredEmailCount: number;
  };
  processTabResults: number;
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

interface DebugPanelProps {
  mode: 'triage' | 'process';
  emails: Email[];
  isOpen: boolean;
  onToggle: () => void;
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
    const filteredByMode = mode === 'process'
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
          backgroundColor: '#FFF3CD',
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
          backgroundColor: '#FFF3CD',
          fontSize: theme.typography.fontSize.xs,
          fontFamily: 'monospace',
          maxHeight: '600px',
          overflowY: 'auto',
        }}>
          {/* Missing Starred Threads Debug Section */}
          <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, backgroundColor: '#fff', borderRadius: theme.borderRadius.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
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
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                }}>
                  <div style={{ padding: theme.spacing.sm, backgroundColor: '#E8F4FD', borderRadius: theme.borderRadius.sm }}>
                    <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>📧 Gmail (is:starred is:inbox)</h5>
                    {debugStarredData.gmail.error ? (
                      <div style={{ color: 'red' }}>Error: {debugStarredData.gmail.error}</div>
                    ) : (
                      <div><strong>{debugStarredData.gmail.starredThreadCount}</strong> starred threads</div>
                    )}
                  </div>
                  <div style={{ padding: theme.spacing.sm, backgroundColor: '#E8F4FD', borderRadius: theme.borderRadius.sm }}>
                    <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>🗄️ Database</h5>
                    <div><strong>{debugStarredData.database.starredThreadCount}</strong> starred threads</div>
                    <div><strong>{debugStarredData.database.starredEmailCount}</strong> starred emails</div>
                  </div>
                </div>

                {/* Comparison Results */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: theme.spacing.sm,
                  marginBottom: theme.spacing.md,
                  padding: theme.spacing.sm,
                  backgroundColor: '#FFF3CD',
                  borderRadius: theme.borderRadius.sm,
                }}>
                  <div style={{ color: debugStarredData.comparison.inGmailNotInDb.length > 0 ? 'red' : 'green' }}>
                    <strong>In Gmail, not in DB:</strong> {debugStarredData.comparison.inGmailNotInDb.length}
                    {debugStarredData.comparison.inGmailNotInDb.length > 0 && (
                      <div style={{ fontSize: '0.6rem' }}>{debugStarredData.comparison.inGmailNotInDb.join(', ')}</div>
                    )}
                  </div>
                  <div style={{ color: debugStarredData.comparison.inDbNotInGmail.length > 0 ? 'orange' : 'green' }}>
                    <strong>In DB, not in Gmail:</strong> {debugStarredData.comparison.inDbNotInGmail.length}
                    {debugStarredData.comparison.inDbNotInGmail.length > 0 && (
                      <div style={{ fontSize: '0.6rem' }}>{debugStarredData.comparison.inDbNotInGmail.join(', ')}</div>
                    )}
                  </div>
                  <div>
                    <strong>Process Tab Results:</strong> {debugStarredData.processTabResults}
                  </div>
                </div>

                {debugStarredData.missingFromProcessTab.length > 0 && (
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <h5 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: 'red' }}>⚠️ Missing from Process Tab:</h5>
                    {debugStarredData.missingFromProcessTab.map((item, idx) => (
                      <div key={idx} style={{
                        padding: theme.spacing.sm,
                        backgroundColor: '#FFE6E6',
                        border: '1px solid #F5C6CB',
                        borderRadius: theme.borderRadius.sm,
                        marginBottom: theme.spacing.xs,
                      }}>
                        <div><strong>Thread:</strong> {item.threadId}</div>
                        <div><strong>Reason:</strong> <span style={{ color: 'red' }}>{item.reason}</span></div>
                        <div><strong>Details:</strong> Stars: {item.details.starCount} | Emails: {item.details.emailCount} | In Gmail: {item.details.inGmail ? '✅' : '❌'} | Subject: {item.details.subject}</div>
                      </div>
                    ))}
                  </div>
                )}

                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                    All Starred Threads in DB ({debugStarredData.starredThreads.length})
                  </summary>
                  {debugStarredData.starredThreads.map((thread, idx) => (
                    <div key={idx} style={{
                      padding: theme.spacing.sm,
                      backgroundColor: thread.issues.length > 0 ? '#FFE6E6' : '#D4EDDA',
                      border: `1px solid ${thread.issues.length > 0 ? '#F5C6CB' : '#C3E6CB'}`,
                      borderRadius: theme.borderRadius.sm,
                      marginBottom: theme.spacing.xs,
                    }}>
                      <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
                        <span><strong>Thread:</strong> {thread.threadId}</span>
                        <span><strong>Stars:</strong> {'⭐'.repeat(thread.starCount)}</span>
                        <span><strong>Emails:</strong> {thread.emailCount}</span>
                        <span><strong>Archived:</strong> {thread.isArchived ? '❌ YES' : '✅ NO'}</span>
                        <span><strong>In Gmail:</strong> {thread.inGmail ? '✅' : '❌'}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: theme.colors.text.secondary, marginTop: '2px' }}>
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

          {/* Orphan Emails Debug Section */}
          <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, backgroundColor: '#fff', borderRadius: theme.borderRadius.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
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
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: theme.spacing.sm,
                  marginBottom: theme.spacing.md,
                  padding: theme.spacing.sm,
                  backgroundColor: debugOrphanData.orphanEmails > 0 ? '#FFE6E6' : '#E8F4FD',
                  borderRadius: theme.borderRadius.sm,
                }}>
                  <div><strong>Total Emails:</strong> {debugOrphanData.totalEmailsInDb}</div>
                  <div><strong>With Thread ID:</strong> {debugOrphanData.emailsWithThreadId}</div>
                  <div style={{ color: debugOrphanData.orphanEmails > 0 ? 'red' : 'green', fontWeight: 'bold' }}>
                    <strong>Orphan Emails:</strong> {debugOrphanData.orphanEmails}
                  </div>
                  <div><strong>Threads in DB:</strong> {debugOrphanData.threadsInDb}</div>
                </div>

                {debugOrphanData.orphanEmails > 0 && (
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
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
                    {debugOrphanData.orphanEmailDetails.slice(0, 10).map((email, idx) => (
                      <div key={idx} style={{
                        padding: theme.spacing.sm,
                        backgroundColor: '#FFE6E6',
                        border: '1px solid #F5C6CB',
                        borderRadius: theme.borderRadius.sm,
                        marginBottom: theme.spacing.xs,
                      }}>
                        <div><strong>Email ID:</strong> {email.id} | <strong>Gmail Thread:</strong> {email.threadId} | <strong>DB Thread:</strong> {email.emailThreadId || 'NULL'}</div>
                        <div style={{ fontSize: '0.65rem', color: theme.colors.text.secondary }}>{email.from}: {email.subject}</div>
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
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: theme.spacing.sm, color: 'orange' }}>
                      ⚠️ Threads Without Emails ({debugOrphanData.threadsWithoutEmails.length})
                    </summary>
                    {debugOrphanData.threadsWithoutEmails.map((thread, idx) => (
                      <div key={idx} style={{
                        padding: theme.spacing.sm,
                        backgroundColor: '#FFF3CD',
                        border: '1px solid #FFEEBA',
                        borderRadius: theme.borderRadius.sm,
                        marginBottom: theme.spacing.xs,
                      }}>
                        <span><strong>DB ID:</strong> {thread.id} | <strong>Gmail Thread:</strong> {thread.threadId} | <strong>Stars:</strong> {thread.starCount} | <strong>Archived:</strong> {thread.isArchived ? 'YES' : 'NO'}</span>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Current Tab Emails */}
          <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0` }}>📧 Current Tab Emails ({emails.length})</h4>
          {emails.map((email) => {
            const starCount = email.starCount ?? 0;
            const shouldBeIn = starCount > 0 ? 'process' : 'triage';
            const isInWrongTab = shouldBeIn !== mode;
            const isArchived = email.isArchived ?? false;
            return (
              <div
                key={email.id}
                style={{
                  padding: theme.spacing.xs,
                  marginBottom: theme.spacing.xs,
                  backgroundColor: isArchived ? '#FFE6E6' : (isInWrongTab ? '#F8D7DA' : '#D1ECF1'),
                  border: `1px solid ${isArchived ? '#F5C6CB' : (isInWrongTab ? '#F5C6CB' : '#BEE5EB')}`,
                  borderRadius: theme.borderRadius.sm,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '500px' }}>
                    <span>
                      <strong>ThreadID:</strong> {email.threadId?.substring(0, 8)}... |
                      <strong> EmailID:</strong> {email.id.substring(0, 8)}... |
                      <strong> StarCount:</strong> {starCount} |
                      <strong> Archived:</strong> {isArchived ? 'YES' : 'NO'} |
                      <strong> Should be in:</strong> {shouldBeIn} |
                      <strong> Current tab:</strong> {mode} |
                      <strong> Priority:</strong> {email.priorityScore?.toFixed(1) || 'N/A'}
                      {isArchived && <span style={{ color: 'red', fontWeight: 'bold' }}> ⚠️ ARCHIVED!</span>}
                      {isInWrongTab && !isArchived && <span style={{ color: 'red', fontWeight: 'bold' }}> ❌ WRONG TAB!</span>}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: theme.colors.text.secondary }}>
                      {email.subject || '(No Subject)'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {emails.length === 0 && (
            <div style={{ color: theme.colors.text.secondary }}>
              No threads to display in debug view
            </div>
          )}
        </div>
      )}
    </div>
  );
};
