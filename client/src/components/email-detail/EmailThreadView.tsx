import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { CleanBodyResult, CleanHtmlResult } from 'utils/emailBodyUtils';

import { EmailAttachments } from './EmailAttachments';
import { EmailBodyIframe } from './EmailBodyIframe';
import { ExpandCollapseButton } from './ExpandCollapseButton';

interface EmailThreadViewProps {
  email: Email;
  threadEmails: Email[];
  expandedThreadItems: Set<string>;
  onToggleThreadItem: (emailId: string) => void;
  extractCleanBody: (body: string, htmlBody?: string) => string;
  removeSignature: (html: string, removeLastSignature?: boolean) => string;
  extractCleanHtmlBody: (html: string) => string;
  sanitizeAndProcessHtml: (html: string) => string;
  extractCleanHtmlBodyWithMeta: (html: string) => CleanHtmlResult;
  extractCleanBodyWithMeta: (body: string, htmlBody?: string) => CleanBodyResult;
}

/**
 * Renders the email thread or single-email body.
 *
 * Wrapped in React.memo (#978): this component calls DOMParser.parseFromString() and
 * DOMPurify for each email in the thread, which is expensive synchronous DOM work.
 * Previously, any `draft` state change in the parent (EmailDetail) would cause this
 * component to re-render on every keystroke, even though none of its props had changed.
 * React.memo prevents that by bailing out when props are reference-equal.
 *
 * Pre-computed body values are memoised via useMemo so that they are only recalculated
 * when the thread emails themselves change, not on every render.
 */
export const EmailThreadView: React.FC<EmailThreadViewProps> = React.memo(
  ({
    email,
    threadEmails,
    expandedThreadItems,
    onToggleThreadItem,
    extractCleanBody,
    removeSignature,
    extractCleanHtmlBody,
    sanitizeAndProcessHtml,
    extractCleanHtmlBodyWithMeta,
    extractCleanBodyWithMeta,
  }) => {
    const { t } = useTranslation();

    // Track which email bodies are expanded to show full forwarded content
    const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());

    const toggleExpandedBody = (emailId: string) => {
      setExpandedBodies(prev => {
        const next = new Set(prev);
        if (next.has(emailId)) {
          next.delete(emailId);
        } else {
          next.add(emailId);
        }
        return next;
      });
    };

    // Pre-compute clean plain-text bodies for all thread emails once (keyed on email ids
    // + body content). This avoids re-running DOMParser on every render when the user
    // toggles a thread item (expandedThreadItems changes) but the bodies haven't changed.
    const cleanBodiesByEmailId = useMemo(() => {
      const map = new Map<string, CleanBodyResult>();
      for (const threadEmail of threadEmails) {
        const rawBody = threadEmail.body || '';
        const rawHtmlBody = (threadEmail as any).htmlBody || '';
        if (rawBody) {
          map.set(threadEmail.id, extractCleanBodyWithMeta(rawBody, rawHtmlBody));
        } else {
          map.set(threadEmail.id, { text: '', wasTruncated: false });
        }
      }
      return map;
    }, [threadEmails, extractCleanBodyWithMeta]);

    // Pre-compute clean HTML results for all thread emails (to detect truncation)
    const cleanHtmlByEmailId = useMemo(() => {
      const map = new Map<string, CleanHtmlResult>();
      for (const threadEmail of threadEmails) {
        const rawHtmlBody = (threadEmail as any).htmlBody || '';
        if (rawHtmlBody) {
          map.set(threadEmail.id, extractCleanHtmlBodyWithMeta(rawHtmlBody));
        }
      }
      return map;
    }, [threadEmails, extractCleanHtmlBodyWithMeta]);

    // Pre-compute single-email view results (hooks must be called unconditionally,
    // even though these values are only used in the single-email branch below).
    const singleEmailHtmlBody = (email as any).htmlBody || '';
    const singleCleanHtmlResult = useMemo(
      () => (singleEmailHtmlBody ? extractCleanHtmlBodyWithMeta(singleEmailHtmlBody) : null),
      [singleEmailHtmlBody, extractCleanHtmlBodyWithMeta]
    );
    const singleCleanBodyResult = useMemo(
      () => extractCleanBodyWithMeta(email.body || ''),
      [email.body, extractCleanBodyWithMeta]
    );

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
          {threadEmails.map(threadEmail => {
            const isExpanded = expandedThreadItems.has(threadEmail.id);
            const isCurrentEmail = threadEmail.id === email.id;
            const rawHtmlBody = (threadEmail as any).htmlBody || '';
            const cleanBodyResult = cleanBodiesByEmailId.get(threadEmail.id) ?? { text: '', wasTruncated: false };
            const cleanBody = cleanBodyResult.text;
            const cleanHtmlResult = cleanHtmlByEmailId.get(threadEmail.id);
            const isBodyExpanded = expandedBodies.has(threadEmail.id);

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
                      <>
                        <EmailBodyIframe
                          html={
                            isBodyExpanded
                              ? sanitizeAndProcessHtml(rawHtmlBody)
                              : sanitizeAndProcessHtml(cleanHtmlResult?.html ?? extractCleanHtmlBody(rawHtmlBody))
                          }
                        />
                        {cleanHtmlResult?.wasTruncated && (
                          <ExpandCollapseButton
                            isExpanded={isBodyExpanded}
                            onToggle={() => toggleExpandedBody(threadEmail.id)}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {isBodyExpanded ? threadEmail.body : cleanBody || threadEmail.body}
                        </div>
                        {cleanBodyResult.wasTruncated && (
                          <ExpandCollapseButton
                            isExpanded={isBodyExpanded}
                            onToggle={() => toggleExpandedBody(threadEmail.id)}
                          />
                        )}
                      </>
                    )}
                    {Array.isArray(threadEmail.attachments) && threadEmail.attachments.length > 0 && (
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
          })}
        </div>
      );
    }

    const isSingleBodyExpanded = expandedBodies.has(email.id);

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
          <>
            <EmailBodyIframe
              html={
                isSingleBodyExpanded
                  ? sanitizeAndProcessHtml(singleEmailHtmlBody)
                  : sanitizeAndProcessHtml(singleCleanHtmlResult?.html ?? extractCleanHtmlBody(singleEmailHtmlBody))
              }
            />
            {singleCleanHtmlResult?.wasTruncated && (
              <ExpandCollapseButton
                isExpanded={isSingleBodyExpanded}
                onToggle={() => toggleExpandedBody(email.id)}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {isSingleBodyExpanded ? email.body : singleCleanBodyResult.text || email.body || ''}
            </div>
            {singleCleanBodyResult.wasTruncated && (
              <ExpandCollapseButton
                isExpanded={isSingleBodyExpanded}
                onToggle={() => toggleExpandedBody(email.id)}
              />
            )}
          </>
        )}
        {Array.isArray(email.attachments) && email.attachments.length > 0 && (
          <EmailAttachments emailId={email.id} attachments={email.attachments} />
        )}
      </div>
    );
  }
);

EmailThreadView.displayName = 'EmailThreadView';
