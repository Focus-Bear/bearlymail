import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { CRMDealsSection } from 'components/crm/CRMDealsSection';
import { EmailDetailBody, EmailThreadList } from 'components/email-detail';
import { EmailAttachments } from 'components/email-detail/EmailAttachments';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { extractEmailAddress } from 'utils/emailUtils';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';
import { FONT_WEIGHT_SEMIBOLD, OPACITY_DISABLED } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { LETTER_SPACING_WIDER, STRING_NONE } from 'constants/strings';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '😊', value: 1 },
  { label: 'Get on it', emoji: '😀', value: 2 },
  { label: 'Oh sh$t', emoji: '🤯', value: 3 },
];

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

interface EmailDetailContentProps {
  email: Email;
  emailId: string;
  threadEmails: Email[];
  expandedThreadItems: Set<string>;
  noteContent: string;
  notesCollapsed: boolean;
  actionItems: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>;
  newActionItem: string;
  isGeneratingSummary: boolean;
  githubLinks: any[];
  loadingGithub: boolean;
  hasGithubToken: boolean;
  onNoteContentChange: (content: string) => void;
  onToggleNotesCollapsed: () => void;
  onSaveNote: () => void;
  onNewActionItemChange: (value: string) => void;
  onAddActionItem: () => void;
  onToggleActionItem: (itemId: string, completed: boolean) => void;
  onDeleteActionItem: (itemId: string) => void;
  onExtractActions: () => void;
  onRefreshGithub: () => void;
  onToggleThreadItem: (emailId: string) => void;
  onArchive?: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount?: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
  onOpenReplyComposer?: (mode: 'reply' | 'replyAll' | 'forward') => void;
  onBlockSender?: (emailId: string) => void;
  onSnooze?: (duration: string) => void;
}

// eslint-disable-next-line max-lines-per-function
export const EmailDetailContent: React.FC<EmailDetailContentProps> = ({
  email,
  emailId,
  threadEmails,
  expandedThreadItems,
  noteContent,
  notesCollapsed,
  actionItems,
  newActionItem,
  isGeneratingSummary,
  githubLinks,
  loadingGithub,
  hasGithubToken,
  onNoteContentChange,
  onToggleNotesCollapsed,
  onSaveNote,
  onNewActionItemChange,
  onAddActionItem,
  onToggleActionItem,
  onDeleteActionItem,
  onExtractActions,
  onRefreshGithub,
  onToggleThreadItem,
  onArchive,
  onSetStarCount,
  onOpenReplyComposer,
  onBlockSender,
  onSnooze,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');

  const [gmailStarStatus, setGmailStarStatus] = useState<any>(null);
  const [loadingStarStatus, setLoadingStarStatus] = useState(false);
  const [gmailLabels, setGmailLabels] = useState<any>(null);
  const [loadingLabels, setLoadingLabels] = useState(false);

  useEffect(() => {
    if (user?.isAdmin && emailId) {
      setLoadingStarStatus(true);
      axios.get(`${API_URL}/emails/${emailId}/gmail-star-status`)
        .then(response => {
          setGmailStarStatus(response.data);
          setLoadingStarStatus(false);
        })
        .catch(error => {
          console.error('Error fetching Gmail star status:', error);
          setGmailStarStatus({ error: error.message });
          setLoadingStarStatus(false);
        });

      setLoadingLabels(true);
      axios.get(`${API_URL}/emails/${emailId}/gmail-labels`)
        .then(response => {
          setGmailLabels(response.data);
          setLoadingLabels(false);
        })
        .catch(error => {
          console.error('Error fetching Gmail labels:', error);
          setGmailLabels({ error: error.message });
          setLoadingLabels(false);
        });
    }
  }, [user?.isAdmin, emailId]);

  const unsubscribeLink = useMemo(() => {
    const htmlBody = emailWithStarCount?.htmlBody;
    return extractUnsubscribeLink(htmlBody, email.body);
  }, [emailWithStarCount?.htmlBody, email.body]);

  const handleUnsubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unsubscribeLink) {
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent('email_unsubscribe_clicked', { email_id: emailId });
    }
  };

  const handleBlockSenderClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBlockSender) {
      onBlockSender(emailId);
    } else {
      captureEvent('email_block_sender_clicked', { email_id: emailId });
      try {
        await axios.post(`${API_URL}/emails/${emailId}/block-sender`);
      } catch (error) {
        console.error('Error blocking sender:', error);
      }
    }
  };

  const hasActions = onSetStarCount || onOpenReplyComposer || onArchive || onBlockSender || unsubscribeLink || onSnooze;

  return (
    <div style={{ padding: theme.spacing.xl, height: '100%', overflowY: 'auto' }}>

      {hasActions && (
        <div style={{ marginBottom: theme.spacing.lg }}>
          {/* Primary action row */}
          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: theme.spacing.md,
          }}>
            {/* Reply All */}
            {onOpenReplyComposer && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenReplyComposer('replyAll'); }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.text.primary,
                  color: COLOR_NAMED_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <FiCornerUpLeft size={15} />
                {t('emailDetail.replyAll')}
              </button>
            )}

            {/* Forward */}
            {onOpenReplyComposer && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenReplyComposer('forward'); }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <FiCornerUpRight size={15} />
                {t('emailDetail.forward')}
              </button>
            )}

            {/* Separator */}
            {(onArchive || onSnooze) && (onOpenReplyComposer) && (
              <div style={{
                width: '1px',
                height: '28px',
                backgroundColor: theme.colors.border.light,
                flexShrink: 0,
              }} />
            )}

            {/* Archive */}
            {onArchive && (
              <button
                onClick={(e) => { e.stopPropagation(); onArchive(emailId, e); }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.secondary,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <FiArchive size={15} />
                {t('emailDetail.archive')}
              </button>
            )}

            {/* Snooze */}
            {onSnooze && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  captureEvent('email_snooze_clicked', { email_id: emailId });
                  setShowSnoozeInput(!showSnoozeInput);
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: showSnoozeInput ? theme.colors.primary.light : 'transparent',
                  color: theme.colors.text.secondary,
                  border: showSnoozeInput ? `1px solid ${theme.colors.primary.main}` : 'none',
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <FiClock size={15} />
                {t('emailDetail.snooze')}
              </button>
            )}

            {/* Unsubscribe / Block Sender (secondary) */}
            {unsubscribeLink ? (
              <button
                onClick={handleUnsubscribeClick}
                title={t('inbox.unsubscribe')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.secondary,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  opacity: OPACITY_DISABLED,
                  marginLeft: 'auto',
                }}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span>{EMOJI_LINK}</span>
                <span>{t('inbox.unsubscribe')}</span>
              </button>
            ) : (onBlockSender && (
              <button
                onClick={handleBlockSenderClick}
                title={t('inbox.blockSender')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.secondary,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  opacity: OPACITY_DISABLED,
                  marginLeft: 'auto',
                }}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span>{EMOJI_BLOCK}</span>
                <span>{t('inbox.blockSender')}</span>
              </button>
            ))}
          </div>

          {/* Snooze input */}
          {showSnoozeInput && onSnooze && (
            <div style={{
              borderTop: `1px solid ${theme.colors.border.light}`,
              paddingTop: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
            }}>
              <SnoozeInputForm
                email={email as any}
                snoozeValue={snoozeValue}
                onValueChange={setSnoozeValue}
                onConfirm={() => {
                  onSnooze(snoozeValue);
                  setShowSnoozeInput(false);
                  setSnoozeValue('');
                }}
                onCancel={() => {
                  setShowSnoozeInput(false);
                  setSnoozeValue('');
                }}
              />
            </div>
          )}

          {/* PRIORITIZE row */}
          {onSetStarCount && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingTop: theme.spacing.sm,
              borderTop: `1px solid ${theme.colors.border.light}`,
            }}>
              <span style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
                fontWeight: theme.typography.fontWeight.semibold,
                letterSpacing: LETTER_SPACING_WIDER,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                {t('inbox.prioritise')}
              </span>
              <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
                  const isActive = starCount === value;
                  return (
                    <button
                      key={value}
                      onClick={(e) => {
                        e.stopPropagation();
                        const newCount = starCount === value ? 0 : value;
                        onSetStarCount(emailId, newCount, e);
                      }}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                        backgroundColor: isActive ? theme.colors.text.primary : 'transparent',
                        color: isActive ? 'white' : theme.colors.text.secondary,
                        border: `1px solid ${isActive ? theme.colors.text.primary : theme.colors.border.medium}`,
                        borderRadius: theme.borderRadius.full || '999px',
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                        fontWeight: theme.typography.fontWeight.medium,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{emoji}</span>
                      {/* eslint-disable-next-line i18next/no-literal-string */}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: theme.spacing.xl }}>
        <PrivateNotesSection
          noteContent={noteContent}
          notesCollapsed={notesCollapsed}
          onNoteContentChange={onNoteContentChange}
          onToggleCollapsed={onToggleNotesCollapsed}
          onSaveNote={onSaveNote}
        />

        <ActionItemsSection
          actionItems={actionItems}
          newActionItem={newActionItem}
          isGeneratingSummary={isGeneratingSummary}
          onNewActionItemChange={onNewActionItemChange}
          onAddActionItem={onAddActionItem}
          onToggleActionItem={onToggleActionItem}
          onDeleteActionItem={onDeleteActionItem}
          onExtractActions={onExtractActions}
        />

        {hasGithubToken && (
          <GitHubStatusSection
            links={githubLinks}
            loading={loadingGithub}
            hasToken={hasGithubToken}
            onRefresh={onRefreshGithub}
            emailSubject={email.subject}
            emailBody={email.body}
            emailHtmlBody={email.htmlBody}
          />
        )}

        <CRMDealsSection
          senderEmail={extractEmailAddress(email.from)}
          emailSubject={email.subject}
        />
      </div>

      <EmailThreadList
        threadEmails={threadEmails}
        currentEmailId={emailId}
        expandedThreadItems={expandedThreadItems}
        onToggleThreadItem={onToggleThreadItem}
      />

      <EmailDetailBody body={email.body} htmlBody={email.htmlBody || undefined} />

      {email.attachments && email.attachments.length > 0 && (
        <EmailAttachments
          emailId={emailId}
          attachments={email.attachments}
        />
      )}

      {/* eslint-disable i18next/no-literal-string */}
      {user?.isAdmin && email && (() => {
        const emailData = email as any;
        return (
          <div style={{
            marginTop: theme.spacing.xl,
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
          }}>
            <h3 style={{
              marginTop: 0,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: FONT_WEIGHT_SEMIBOLD,
              color: theme.colors.text.primary,
            }}>
              Debug Information (Admin Only)
            </h3>
            <div style={{
              fontFamily: 'monospace',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              lineHeight: 1.6,
            }}>
              <div><strong>Email ID:</strong> {emailData.id}</div>
              <div><strong>Thread ID:</strong> {emailData.threadId || 'N/A'}</div>
              <div><strong>Email Thread ID:</strong> {emailData.emailThreadId || 'N/A'}</div>
              <div><strong>Message ID:</strong> {emailData.messageId || 'N/A'}</div>
              <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
                <strong>Labels:</strong>
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <div><strong>Email ID (for reference):</strong> {emailData.id}</div>
                  <div><strong>Message ID (for Gmail lookup):</strong> {emailData.messageId || 'N/A'}</div>

                  <div style={{ marginTop: theme.spacing.xs }}>
                    <strong>DB Labels:</strong>
                    <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                      <div><strong>Raw (stored in DB):</strong> {gmailLabels?.dbLabels?.raw ? JSON.stringify(gmailLabels.dbLabels.raw) : JSON.stringify(emailData.labels ?? [])}</div>
                      <div><strong>Names (converted):</strong> {gmailLabels?.dbLabels?.names ? JSON.stringify(gmailLabels.dbLabels.names) : JSON.stringify(emailData.labels ?? [])}</div>
                      <div><strong>Count:</strong> {gmailLabels?.dbLabels?.names?.length || emailData.labels?.length || 0}</div>
                    </div>
                  </div>

                  {loadingLabels && <div>Loading Gmail labels...</div>}
                  {gmailLabels && gmailLabels.gmailLabels && (
                    <>
                      <div style={{ marginTop: theme.spacing.xs }}>
                        <strong>Gmail Labels (from API):</strong>
                        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                          <div><strong>Raw Label IDs:</strong> {gmailLabels.gmailLabels.labelIds ? JSON.stringify(gmailLabels.gmailLabels.labelIds) : '[]'}</div>
                          <div><strong>Converted Names:</strong> {gmailLabels.gmailLabels.labelNames ? JSON.stringify(gmailLabels.gmailLabels.labelNames) : '[]'}</div>
                          <div><strong>Count:</strong> {gmailLabels.gmailLabels.labelIds?.length || 0}</div>
                        </div>
                      </div>

                      {gmailLabels.labelMapping && gmailLabels.labelMapping.length > 0 && (
                        <div style={{ marginTop: theme.spacing.xs }}>
                          <strong>Label Mapping (ID → Name):</strong>
                          <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs, fontSize: theme.typography.fontSize.xs }}>
                            {gmailLabels.labelMapping.map((mapping: any) => (
                              <div key={mapping.id}>{mapping.id} → {mapping.name}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {gmailLabels.gmailLabels.error && (
                        <div style={{ color: theme.colors.error.main }}><strong>Gmail Error:</strong> {gmailLabels.gmailLabels.error}</div>
                      )}

                      <div style={{
                        marginTop: theme.spacing.xs,
                        padding: theme.spacing.xs,
                        backgroundColor: JSON.stringify(gmailLabels.dbLabels?.names || emailData.labels || []) === JSON.stringify(gmailLabels.gmailLabels.labelNames || [])
                          ? theme.colors.success.light
                          : theme.colors.error.light,
                        borderRadius: theme.borderRadius.sm,
                      }}>
                        <strong>Match Status:</strong> {JSON.stringify(gmailLabels.dbLabels?.names || emailData.labels || []) === JSON.stringify(gmailLabels.gmailLabels.labelNames || []) ? '✓ MATCH' : '✗ MISMATCH'}
                        {JSON.stringify(gmailLabels.dbLabels?.names || emailData.labels || []) !== JSON.stringify(gmailLabels.gmailLabels.labelNames || []) && (
                          <div style={{ marginTop: theme.spacing.xs, fontSize: theme.typography.fontSize.xs }}>
                            <div><strong>DB Names:</strong> {JSON.stringify(gmailLabels.dbLabels?.names || emailData.labels || [])}</div>
                            <div><strong>Gmail Names:</strong> {JSON.stringify(gmailLabels.gmailLabels.labelNames || [])}</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {gmailLabels?.error && (
                    <div style={{ color: theme.colors.error.main }}><strong>Error:</strong> {gmailLabels.error}</div>
                  )}
                </div>
              </div>
              <div><strong>Received At:</strong> {emailData.receivedAt}</div>
              <div><strong>Is Read:</strong> {emailData.isRead ? 'true' : 'false'}</div>
              <div><strong>Is Archived:</strong> {emailData.isArchived ? 'true' : 'false'}</div>
              <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
                <strong>Star Status:</strong>
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <div><strong>DB Star Count (from thread):</strong> {gmailStarStatus?.dbStarCount ?? (loadingStarStatus ? 'loading...' : 'N/A')}</div>
                  <div><strong>Star Count:</strong> {emailData.starCount || 0}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* eslint-enable i18next/no-literal-string */}
    </div>
  );
};
