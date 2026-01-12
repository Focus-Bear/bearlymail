import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeTimestamp } from 'utils/dateUtils';
import { Email } from 'types/email';

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
        <h3 style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
        }}>
          💬 {t('emailDetail.thread')} ({threadEmails.length} {threadEmails.length === 1 ? t('emailDetail.message') : t('emailDetail.messages')})
        </h3>
        {threadEmails.map(
          // eslint-disable-next-line max-lines-per-function -- Thread email rendering requires handling multiple states and UI elements
          (threadEmail) => {
          const isExpanded = expandedThreadItems.has(threadEmail.id);
          const isCurrentEmail = threadEmail.id === email.id;
          const rawBody = threadEmail.body || '';
          const rawHtmlBody = (threadEmail as any).htmlBody || '';
          const cleanBody = rawBody ? extractCleanBody(rawBody, rawHtmlBody) : '';
          const cleanHtmlBody = rawHtmlBody 
            ? removeSignature(extractCleanHtmlBody(rawHtmlBody), true) 
            : null;
          
          return (
            <div
              key={threadEmail.id}
              style={{
                marginBottom: theme.spacing.lg,
                border: isCurrentEmail ? `2px solid ${theme.colors.primary.main}` : `1px solid ${theme.colors.border.light}`,
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
                  <div style={{
                    fontWeight: theme.typography.fontWeight.semibold,
                    color: theme.colors.text.primary,
                    marginBottom: theme.spacing.xs,
                  }}>
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
                <div style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: theme.colors.background.paper,
                  borderRadius: theme.borderRadius.md,
                }}>
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>
              
              {isExpanded ? (
                <div style={{
                  padding: theme.spacing.lg,
                  color: theme.colors.text.primary,
                  lineHeight: '1.8',
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.normal,
                }}>
                  {cleanHtmlBody || (threadEmail as any).htmlBody ? (
                    <div 
                      style={{
                        maxWidth: '100%',
                        overflow: 'auto',
                        isolation: 'isolate',
                      }}
                      dangerouslySetInnerHTML={{ 
                        __html: sanitizeAndProcessHtml(
                          (cleanHtmlBody || (threadEmail as any).htmlBody).replace(/<style([^>]*)>/gi, '<style$1 scoped>')
                        )
                      }} 
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {cleanBody || threadEmail.body}
                    </div>
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
                    <span style={{ color: theme.colors.primary.main, textDecoration: 'underline' }}> ({t('emailDetail.clickToExpand')})</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      color: theme.colors.text.primary,
      lineHeight: '1.8',
      fontSize: theme.typography.fontSize.lg,
      marginBottom: theme.spacing.xl,
    }}>
      {(email as any).htmlBody ? (
        <div 
          style={{
            maxWidth: '100%',
            overflow: 'auto',
            isolation: 'isolate',
          }}
          dangerouslySetInnerHTML={{ 
            __html: sanitizeAndProcessHtml(
              removeSignature(extractCleanHtmlBody((email as any).htmlBody), true).replace(/<style([^>]*)>/gi, '<style$1 scoped>')
            )
          }} 
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {extractCleanBody(email.body || '') || email.body || ''}
        </div>
      )}
    </div>
  );
};


