import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { getAxiosResponseErrorMessage } from 'utils/axios-error-message';

import { API_URL } from 'config/api';

/** Opacity for controls in a non-interactive (loading) state */
const DISABLED_CONTROL_OPACITY = 0.7;

interface Props {
  email: any;
  threadEmails: Email[];
  /** Re-load email + thread after Gmail attachment metadata is synced */
  onAttachmentsSynced?: () => Promise<void>;
}

function formatStoredAttachmentsSummary(att: unknown, noneLabel: string): string {
  if (!Array.isArray(att) || att.length === 0) {
    return noneLabel;
  }
  const names = att.map((attachment: { filename?: string }) => attachment.filename || '?').join(', ');
  return `${att.length} (${names})`;
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
  const none = t('debug.emailDetail.attachmentsNone');
  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <strong>{t('debug.emailDetail.threadEmails', { count: threadEmails.length })}</strong>
      {threadEmails.map((threadEmail, idx) => {
        const threadEmailData = threadEmail as any;
        return (
          <div key={threadEmail.id} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
            {t('debug.emailDetail.threadEmailItem', {
              idx,
              messageId: threadEmailData.messageId || t('debug.emailDetail.notAvailable'),
              attachments: formatStoredAttachmentsSummary(threadEmailData.attachments, none),
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
export function EmailDetailDebugInfo({ email, threadEmails, onAttachmentsSynced }: Props) {
  const { t } = useTranslation();
  const emailData = email as any;
  const attachmentsNone = t('debug.emailDetail.attachmentsNone');
  const [refreshingAttachments, setRefreshingAttachments] = useState(false);

  const handleRefreshAttachmentsFromGmail = async () => {
    if (!emailData?.id || refreshingAttachments) {
      return;
    }
    setRefreshingAttachments(true);
    try {
      await axios.post(`${API_URL}/emails/${emailData.id}/debug/refresh-attachments-from-gmail`);
      await onAttachmentsSynced?.();
    } catch (err) {
      console.error('refreshAttachmentsFromGmail:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.refreshAttachmentsFailed');
      alert(msg);
    } finally {
      setRefreshingAttachments(false);
    }
  };

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
          <strong>{t('debug.emailDetail.gmailMessageId')}:</strong>{' '}
          {emailData.messageId || t('debug.emailDetail.notAvailable')}
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
              type="button"
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
          <strong>{t('debug.emailDetail.isRead')}:</strong>{' '}
          {emailData.isRead ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.isArchived')}:</strong>{' '}
          {emailData.isArchived ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.starCount')}:</strong> {emailData.starCount || 0}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <span>
            <strong>{t('debug.emailDetail.attachments')}:</strong>{' '}
            {formatStoredAttachmentsSummary(emailData.attachments, attachmentsNone)}
          </span>
          {emailData.messageId && (
            <button
              type="button"
              disabled={refreshingAttachments}
              onClick={() => void handleRefreshAttachmentsFromGmail()}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: '4px',
                cursor: refreshingAttachments ? 'not-allowed' : 'pointer',
                opacity: refreshingAttachments ? DISABLED_CONTROL_OPACITY : 1,
              }}
            >
              {refreshingAttachments
                ? t('debug.emailDetail.refreshingAttachments')
                : t('debug.emailDetail.refreshAttachmentsFromGmail')}
            </button>
          )}
        </div>
        {threadEmails && threadEmails.length > 0 && <ThreadEmailsList threadEmails={threadEmails} />}
      </div>
    </div>
  );
}
