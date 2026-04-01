import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

interface Props {
  email: any;
  threadEmails: Email[];
}

interface ThreadEmailsListProps {
  threadEmails: Email[];
}

const threadEntryBoxStyle: React.CSSProperties = {
  marginLeft: theme.spacing.md,
  marginTop: theme.spacing.sm,
  paddingLeft: theme.spacing.sm,
  borderLeft: `2px solid ${theme.colors.border.light}`,
  wordBreak: 'break-word',
};

const ThreadEmailsList: React.FC<ThreadEmailsListProps> = ({ threadEmails }) => {
  const { t } = useTranslation();
  const na = () => t('debug.emailDetail.notAvailable');
  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <strong>{t('debug.emailDetail.threadEmails', { count: threadEmails.length })}</strong>
      {threadEmails.map((threadEmail, idx) => (
        <div key={threadEmail.id} style={threadEntryBoxStyle}>
          <div>
            <strong>{t('debug.emailDetail.threadEmailIndex', { idx })}</strong>{' '}
            {t('debug.emailDetail.messageIdAbbrev')}: {threadEmail.messageId ?? na()}
          </div>
          <div>
            <strong>{t('debug.emailDetail.from')}:</strong> {threadEmail.from ?? na()}
          </div>
          <div>
            <strong>{t('debug.emailDetail.to')}:</strong> {threadEmail.to?.trim() ? threadEmail.to : na()}
          </div>
          <div>
            <strong>{t('debug.emailDetail.cc')}:</strong> {threadEmail.cc?.trim() ? threadEmail.cc : na()}
          </div>
          <div>
            <strong>{t('debug.emailDetail.labels')}:</strong>{' '}
            {threadEmail.labels ? JSON.stringify(threadEmail.labels) : '[]'}
          </div>
          <div>
            <strong>{t('debug.emailDetail.receivedAt')}:</strong> {threadEmail.receivedAt ?? na()}
          </div>
        </div>
      ))}
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
