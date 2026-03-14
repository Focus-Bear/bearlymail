import React from 'react';
import { theme } from 'theme/theme';

interface Props {
  email: any;
  threadEmails: any[];
}

interface ThreadEmailsListProps {
  threadEmails: any[];
}

const ThreadEmailsList: React.FC<ThreadEmailsListProps> = ({ threadEmails }) => (
  <div style={{ marginTop: theme.spacing.md }}>
    <strong>Thread Emails ({threadEmails.length}):</strong>
    {threadEmails.map((threadEmail, idx) => {
      const threadEmailData = threadEmail as any;
      return (
        <div key={threadEmail.id} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
          [{idx}] MsgID: {threadEmailData.messageId || 'N/A'} | From: {threadEmailData.from || 'N/A'} | To:{' '}
          {threadEmailData.to || 'N/A'} | CC: {threadEmailData.cc || 'N/A'} | Labels:{' '}
          {threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : '[]'} | Received:{' '}
          {threadEmailData.receivedAt}
        </div>
      );
    })}
  </div>
);

/** Admin-only debug information panel shown in email detail view. */
export function EmailDetailDebugInfo({ email, threadEmails }: Props) {
  const emailData = email as any;
  return (
    <div
      style={{
        marginTop: theme.spacing.xl,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: 600,
          color: theme.colors.text.primary,
        }}
      >
        Debug Information (Admin Only)
      </h3>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          lineHeight: 1.6,
        }}
      >
        <div>
          <strong>From:</strong> {emailData.from || 'N/A'}
          {emailData.fromName ? ` (${emailData.fromName})` : ''}
        </div>
        <div>
          <strong>To:</strong> {emailData.to || 'N/A'}
        </div>
        <div>
          <strong>CC:</strong> {emailData.cc || 'N/A'}
        </div>
        <div>
          <strong>Reply-To:</strong> {emailData.replyTo || 'N/A'}
        </div>
        <div>
          <strong>Gmail Message ID:</strong> {emailData.messageId || 'N/A'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong>Gmail Thread ID:</strong>
          <code
            style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            {emailData.threadId || 'N/A'}
          </code>
          {emailData.threadId && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(emailData.threadId);
                alert('Thread ID copied to clipboard!');
              }}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.background.paper,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Copy
            </button>
          )}
        </div>
        <div>
          <strong>Labels:</strong> {emailData.labels ? JSON.stringify(emailData.labels) : '[]'}
        </div>
        <div>
          <strong>Labels Count:</strong> {emailData.labels?.length || 0}
        </div>
        <div>
          <strong>Received At:</strong> {emailData.receivedAt}
        </div>
        <div>
          <strong>Is Read:</strong> {emailData.isRead ? 'true' : 'false'}
        </div>
        <div>
          <strong>Is Archived:</strong> {emailData.isArchived ? 'true' : 'false'}
        </div>
        <div>
          <strong>Star Count:</strong> {emailData.starCount || 0}
        </div>
        {threadEmails && threadEmails.length > 0 && <ThreadEmailsList threadEmails={threadEmails} />}
      </div>
    </div>
  );
}
