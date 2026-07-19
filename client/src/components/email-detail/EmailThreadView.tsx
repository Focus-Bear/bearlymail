import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { CleanBodyResult, CleanHtmlResult, InlineAttachmentRef, looksLikeHtml } from 'utils/emailBodyUtils';

import { REPLY_MODE_FORWARD, REPLY_MODE_REPLY, REPLY_MODE_REPLY_ALL } from 'constants/strings';

import { EmailAttachments } from './EmailAttachments';
import { ExpandCollapseButton } from './ExpandCollapseButton';
import { ResolvedEmailBody } from './ResolvedEmailBody';

type ReplyMode = typeof REPLY_MODE_REPLY | typeof REPLY_MODE_REPLY_ALL | typeof REPLY_MODE_FORWARD;

const threadReplyButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.primary.main,
  backgroundColor: 'transparent',
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
};

/**
 * Reply / Reply All / Forward buttons for a single message in the thread, letting the
 * user act on any earlier message rather than only the newest one (which the top-level
 * action bar targets). Each button opens the composer pre-populated from this message.
 */
const ThreadMessageReplyActions: React.FC<{
  emailId: string;
  onReplyToMessage: (emailId: string, mode: ReplyMode) => void;
}> = ({ emailId, onReplyToMessage }) => {
  const { t } = useTranslation();
  const actions: Array<{ mode: ReplyMode; label: string; icon: string }> = [
    { mode: REPLY_MODE_REPLY, label: t('emailDetail.reply'), icon: '↩' },
    { mode: REPLY_MODE_REPLY_ALL, label: t('emailDetail.replyAll'), icon: '↩↩' },
    { mode: REPLY_MODE_FORWARD, label: t('emailDetail.forward'), icon: '➔' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
      {actions.map(({ mode, label, icon }) => (
        <button
          key={mode}
          type="button"
          style={threadReplyButtonStyle}
          onClick={event => {
            event.stopPropagation();
            onReplyToMessage(emailId, mode);
          }}
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
};

/**
 * HTML may live in either `htmlBody` or, for some sent/synced messages, the plain
 * `body` field. Fall back to treating `body` as HTML when it contains markup so the
 * iframe renderer preserves line breaks instead of textContent collapsing them.
 */
function getEffectiveHtmlBody(body?: string, htmlBody?: string): string {
  return htmlBody || (looksLikeHtml(body || '') ? body || '' : '');
}

/** Renders a single "Label: value" recipient line in the expanded message header. */
const AddressLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: theme.spacing.xs, wordBreak: 'break-word' }}>
    <span style={{ fontWeight: theme.typography.fontWeight.semibold, flexShrink: 0 }}>{label}:</span>
    <span>{value}</span>
  </div>
);

interface EmailThreadViewProps {
  email: Email;
  threadEmails: Email[];
  expandedThreadItems: Set<string>;
  onToggleThreadItem: (emailId: string) => void;
  /** Opens the reply composer targeting a specific message in the thread. */
  onReplyToMessage?: (emailId: string, mode: ReplyMode) => void;
  extractCleanBody: (body: string, htmlBody?: string) => string;
  removeSignature: (html: string, removeLastSignature?: boolean) => string;
  extractCleanHtmlBody: (html: string) => string;
  sanitizeAndProcessHtml: (html: string, attachments?: InlineAttachmentRef[]) => string;
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
    onReplyToMessage,
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
        const rawHtmlBody = threadEmail.htmlBody || '';
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
        const rawHtmlBody = getEffectiveHtmlBody(threadEmail.body, threadEmail.htmlBody);
        if (rawHtmlBody) {
          map.set(threadEmail.id, extractCleanHtmlBodyWithMeta(rawHtmlBody));
        }
      }
      return map;
    }, [threadEmails, extractCleanHtmlBodyWithMeta]);

    // Pre-compute single-email view results (hooks must be called unconditionally,
    // even though these values are only used in the single-email branch below).
    const singleEmailHtmlBody = useMemo(
      () => getEffectiveHtmlBody(email.body, email.htmlBody),
      [email.body, email.htmlBody]
    );
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
            const rawHtmlBody = isExpanded ? getEffectiveHtmlBody(threadEmail.body, threadEmail.htmlBody) : '';
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
                    <div
                      style={{
                        marginBottom: theme.spacing.md,
                        paddingBottom: theme.spacing.md,
                        borderBottom: `1px solid ${theme.colors.border.light}`,
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.secondary,
                        lineHeight: '1.6',
                      }}
                    >
                      <AddressLine label={t('emailDetail.from')} value={threadEmail.fromName ? `${threadEmail.fromName} <${threadEmail.from}>` : (threadEmail.from || '')} />
                      {threadEmail.to && <AddressLine label={t('emailDetail.to')} value={threadEmail.to} />}
                      {threadEmail.cc && <AddressLine label={t('emailDetail.cc')} value={threadEmail.cc} />}
                    </div>
                    {rawHtmlBody ? (
                      <>
                        <ResolvedEmailBody
                          emailId={threadEmail.id}
                          html={isBodyExpanded ? rawHtmlBody : (cleanHtmlResult?.html ?? extractCleanHtmlBody(rawHtmlBody))}
                          attachments={threadEmail.attachments}
                          sanitize={sanitizeAndProcessHtml}
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
                    {onReplyToMessage && (
                      <ThreadMessageReplyActions emailId={threadEmail.id} onReplyToMessage={onReplyToMessage} />
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
            <ResolvedEmailBody
              emailId={email.id}
              html={isSingleBodyExpanded ? singleEmailHtmlBody : (singleCleanHtmlResult?.html ?? extractCleanHtmlBody(singleEmailHtmlBody))}
              attachments={email.attachments}
              sanitize={sanitizeAndProcessHtml}
            />
            {singleCleanHtmlResult?.wasTruncated && (
              <ExpandCollapseButton isExpanded={isSingleBodyExpanded} onToggle={() => toggleExpandedBody(email.id)} />
            )}
          </>
        ) : (
          <>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {isSingleBodyExpanded ? email.body : singleCleanBodyResult.text || email.body || ''}
            </div>
            {singleCleanBodyResult.wasTruncated && (
              <ExpandCollapseButton isExpanded={isSingleBodyExpanded} onToggle={() => toggleExpandedBody(email.id)} />
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
