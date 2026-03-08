import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';

import { EmailAttachments } from './EmailAttachments';
import { EmailBodyIframe } from './EmailBodyIframe';

interface EmailThreadViewProps {
  email: Email;
  threadEmails: Email[];
  expandedThreadItems: Set<string>;
  onToggleThreadItem: (emailId: string) => void;
  extractCleanBody: (body: string, htmlBody?: string) => string;
  removeSignature: (html: string, removeLastSignature?: boolean) => string;
  extractCleanHtmlBody: (html: string) => string;
  sanitizeAndProcessHtml: (html: string) => string;
}

// eslint-disable-next-line max-lines-per-function -- Email thread view component requires handling multiple thread emails and UI states
export const EmailThreadView: React.FC<EmailThreadViewProps> = ({
  email,
  threadEmails,
  expandedThreadItems,
  onToggleThreadItem,
  extractCleanBody,
  removeSignature,
  extractCleanHtmlBody,
  sanitizeAndProcessHtml,
}) => {
  const { t } = useTranslation();

  if (threadEmails.length > 0) {
    return (
      <div style={{ marginBottom: theme.spacing.xl }}>
        <h3
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
          }}
        >
          💬 {t('emailDetail.thread')} ({threadEmails.length}{' '}
          {threadEmails.length === 1 ? t('emailDetail.message') : t('emailDetail.messages')})
        </h3>
        {threadEmails.map(
          // eslint-disable-next-line max-lines-per-function -- Thread email rendering requires handling multiple states and UI elements
          threadEmail => {
            const isExpanded = expandedThreadItems.has(threadEmail.id);
            const isCurrentEmail = threadEmail.id === email.id;
            const rawBody = threadEmail.body || '';
            const rawHtmlBody = (threadEmail as any).htmlBody || '';
            const cleanBody = rawBody ? extractCleanBody(rawBody, rawHtmlBody) : '';

            return (
              <div
                key={threadEmail.id}
                style={{
                  marginBottom: theme.spacing.lg,
                  border: isCurrentEmail
                    ? `2px solid ${theme.colors.primary.main}`
                    : `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.lg,
                  overflow: 'hidden',
                  backgroundColor: isCurrentEmail ? theme.colors.primary.subtle : theme.colors.background.paper,
                }}
              >
                <div
                  onClick={() => onToggleThreadItem(threadEmail.id)}
                  style={{
                    padding: theme.spacing.md,
                    cursor: 'pointer',
                    backgroundColor: isCurrentEmail ? theme.colors.primary.light : theme.colors.background.subtle,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: theme.typography.fontWeight.semibold,
                        color: theme.colors.text.primary,
                        marginBottom: theme.spacing.xs,
                      }}
                    >
                      {threadEmail.fromName || threadEmail.from}
                    </div>
                    <div
                      style={{
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.primary,
                        opacity: 0.8,
                      }}
                      title={new Date(threadEmail.receivedAt).toLocaleString(undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short',
                      })}
                    >
                      {humanizeTimestamp(threadEmail.receivedAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.secondary,
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.background.paper,
                      borderRadius: theme.borderRadius.md,
                    }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>

                {isExpanded ? (
                  <div
                    style={{
                      padding: theme.spacing.lg,
                      color: theme.colors.text.primary,
                      lineHeight: '1.8',
                      fontSize: theme.typography.fontSize.lg,
                      fontWeight: theme.typography.fontWeight.normal,
                    }}
                  >
                    {rawHtmlBody ? (
                      <EmailBodyIframe html={sanitizeAndProcessHtml(extractCleanHtmlBody(rawHtmlBody))} />
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{cleanBody || threadEmail.body}</div>
                    )}
                    {threadEmail.attachments && threadEmail.attachments.length > 0 && (
                      <EmailAttachments emailId={threadEmail.id} attachments={threadEmail.attachments} />
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => onToggleThreadItem(threadEmail.id)}
                    style={{
                      padding: theme.spacing.md,
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.base,
                      fontStyle: 'italic',
                      lineHeight: '1.6',
                      cursor: 'pointer',
                    }}
                  >
                    {cleanBody.substring(0, 100)}...
                    {cleanBody.length > 100 && (
                      <span style={{ color: theme.colors.primary.main, textDecoration: 'underline' }}>
                        {' '}
                        ({t('emailDetail.clickToExpand')})
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>
    );
  }

  const singleEmailHtmlBody = (email as any).htmlBody || '';

  return (
    <div
      style={{
        color: theme.colors.text.primary,
        lineHeight: '1.8',
        fontSize: theme.typography.fontSize.lg,
        marginBottom: theme.spacing.xl,
      }}
    >
      {singleEmailHtmlBody ? (
        <EmailBodyIframe html={sanitizeAndProcessHtml(extractCleanHtmlBody(singleEmailHtmlBody))} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>{extractCleanBody(email.body || '') || email.body || ''}</div>
      )}
      {email.attachments && email.attachments.length > 0 && (
        <EmailAttachments emailId={email.id} attachments={email.attachments} />
      )}
    </div>
  );
};
