import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface Props {
  email: any;
  threadEmails: any[];
}

interface ThreadEmailsListProps {
  threadEmails: any[];
}

const ThreadEmailsList: React.FC<ThreadEmailsListProps> = ({ threadEmails }) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <strong>{t('debug.emailDetail.threadEmails', { count: threadEmails.length })}</strong>
      {threadEmails.map((threadEmail, idx) => {
        const threadEmailData = threadEmail as any;
        return (
          <div key={threadEmail.id} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
            {t('debug.emailDetail.threadEmailItem', {
              idx,
              messageId: threadEmailData.messageId || t('debug.emailDetail.notAvailable'),
              labels: threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : '[]',
              receivedAt: threadEmailData.receivedAt,
            })}
          </div>
        );
      })}
    </div>
  );
};

/** Admin-only debug information panel shown in email detail view. */
export function EmailDetailDebugInfo({ email, threadEmails }: Props) {
  const { t } = useTranslation();
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
        {t('debug.emailDetail.title')}
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
          <strong>{t('debug.emailDetail.gmailMessageId')}:</strong> {emailData.messageId || t('debug.emailDetail.notAvailable')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong>{t('debug.emailDetail.gmailThreadId')}:</strong>
          <code
            style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            {emailData.threadId || t('debug.emailDetail.notAvailable')}
          </code>
          {emailData.threadId && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(emailData.threadId);
                alert(t('debug.emailDetail.threadIdCopied'));
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
              {t('debug.emailDetail.copyButton')}
            </button>
          )}
        </div>
        <div>
          <strong>{t('debug.emailDetail.to')}:</strong> {emailData.to || t('debug.emailDetail.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.cc')}:</strong> {emailData.cc || t('debug.emailDetail.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.labels')}:</strong> {emailData.labels ? JSON.stringify(emailData.labels) : '[]'}
        </div>
        <div>
          <strong>{t('debug.emailDetail.labelsCount')}:</strong> {emailData.labels?.length || 0}
        </div>
        <div>
          <strong>{t('debug.emailDetail.receivedAt')}:</strong> {emailData.receivedAt}
        </div>
        <div>
          <strong>{t('debug.emailDetail.isRead')}:</strong> {emailData.isRead ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.isArchived')}:</strong> {emailData.isArchived ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.starCount')}:</strong> {emailData.starCount || 0}
        </div>
        {threadEmails && threadEmails.length > 0 && <ThreadEmailsList threadEmails={threadEmails} />}
      </div>
    </div>
  );
}
