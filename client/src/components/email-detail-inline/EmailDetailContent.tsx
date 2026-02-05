import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { EmailDetailBody, EmailThreadList } from 'components/email-detail';
import { EmailAttachments } from 'components/email-detail/EmailAttachments';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { EMOJI_ARCHIVE, EMOJI_REPLY, EMOJI_FORWARD, EMOJI_BLOCK, EMOJI_LINK, EMOJI_STAR } from 'constants/emojis';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';
import { OPACITY_DISABLED } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';

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
}

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
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;
  
  // Fetch Gmail star status for debugging
  const [gmailStarStatus, setGmailStarStatus] = useState<any>(null);
  const [loadingStarStatus, setLoadingStarStatus] = useState(false);
  
  // Fetch Gmail labels for debugging
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

  // Extract unsubscribe link from email
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
      // Fallback: implement block sender directly if prop not provided
      captureEvent('email_block_sender_clicked', { email_id: emailId });
      try {
        await axios.post(`${API_URL}/emails/${emailId}/block-sender`);
        // Optionally refresh or show success message
      } catch (error) {
        console.error('Error blocking sender:', error);
      }
    }
  };

  return (
    <div style={{ padding: theme.spacing.xl, height: '100%', overflowY: 'auto' }}>
      {/* Actions Cards */}
      {(onSetStarCount || onOpenReplyComposer || onArchive || onBlockSender || unsubscribeLink) && (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          borderBottom: `1px solid ${theme.colors.border.light}`,
          alignItems: 'flex-start',
        }}>
          {/* Prioritise Card */}
          {onSetStarCount && (
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.light}`,
              padding: theme.spacing.md,
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing.sm,
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                {t('inbox.prioritise') || 'Prioritise'}:
              </div>
              <div style={{ 
                display: 'flex', 
                gap: theme.spacing.xs, 
                alignItems: 'center' 
              }}>
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    onClick={(e) => {
                      e.stopPropagation();
                      const newCount = starCount === count ? 0 : count;
                      onSetStarCount(emailId, newCount, e);
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: starCount === count ? theme.colors.primary.main : 'transparent',
                      color: starCount === count ? 'white' : theme.colors.text.secondary,
                      border: `1px solid ${starCount === count ? theme.colors.primary.main : theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      fontWeight: theme.typography.fontWeight.medium,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                    }}
                  >
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span>{EMOJI_STAR}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Other Actions Card */}
          {(onOpenReplyComposer || onArchive || onBlockSender || unsubscribeLink) && (
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.light}`,
              padding: theme.spacing.md,
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing.sm,
              flex: 1,
              minWidth: 0,
            }}>
              <div style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                {t('inbox.otherActions') || 'Other actions'}:
              </div>
              <div style={{ 
                display: 'flex', 
                gap: theme.spacing.sm, 
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                {onOpenReplyComposer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReplyComposer('reply');
                    }}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                      backgroundColor: theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.semibold,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                    }}
                  >
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span>{EMOJI_REPLY}</span>
                    {t('emailDetail.reply')}
                  </button>
                )}

                {onOpenReplyComposer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReplyComposer('forward');
                    }}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                      backgroundColor: 'transparent',
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
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span>{EMOJI_FORWARD}</span>
                    {t('emailDetail.forward')}
                  </button>
                )}

                {onArchive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(emailId, e);
                    }}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                      backgroundColor: 'transparent',
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
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span>{EMOJI_ARCHIVE}</span>
                    {t('emailDetail.archive')}
                  </button>
                )}

                {unsubscribeLink ? (
                  <button
                    onClick={handleUnsubscribeClick}
                    title={t('inbox.unsubscribe')}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.medium,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      opacity: OPACITY_DISABLED,
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
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.medium,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      opacity: OPACITY_DISABLED,
                    }}
                  >
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span>{EMOJI_BLOCK}</span>
                    <span>{t('inbox.blockSender')}</span>
                  </button>
                ))}
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
      </div>

      {/* EmailDetailHeader requires full Email object with priority explanation - skipping for inline view */}

      <EmailThreadList
        threadEmails={threadEmails}
        currentEmailId={emailId}
        expandedThreadItems={expandedThreadItems}
        onToggleThreadItem={onToggleThreadItem}
      />

      {(email as any).attachments && (email as any).attachments.length > 0 && (
        <EmailAttachments
          emailId={emailId}
          attachments={(email as any).attachments}
        />
      )}

      <EmailDetailBody body={email.body} htmlBody={email.htmlBody || undefined} />

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
              fontWeight: 600,
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
                      <div><strong>Raw (stored in DB):</strong> {gmailLabels?.dbLabels?.raw ? JSON.stringify(gmailLabels.dbLabels.raw) : (emailData.labels ? JSON.stringify(emailData.labels) : '[]')}</div>
                      <div><strong>Names (converted):</strong> {gmailLabels?.dbLabels?.names ? JSON.stringify(gmailLabels.dbLabels.names) : (emailData.labels ? JSON.stringify(emailData.labels) : '[]')}</div>
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
                            {gmailLabels.labelMapping.map((mapping: any, idx: number) => (
                              <div key={idx}>{mapping.id} → {mapping.name}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {gmailLabels.gmailLabels.error && (
                        <div style={{ color: '#d32f2f' }}><strong>Gmail Error:</strong> {gmailLabels.gmailLabels.error}</div>
                      )}

                      <div style={{ 
                        marginTop: theme.spacing.xs,
                        padding: theme.spacing.xs,
                        backgroundColor: JSON.stringify(gmailLabels.dbLabels?.names || emailData.labels || []) === JSON.stringify(gmailLabels.gmailLabels.labelNames || [])
                          ? '#e8f5e9' 
                          : '#ffebee',
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
                    <div style={{ color: '#d32f2f' }}><strong>Error:</strong> {gmailLabels.error}</div>
                  )}
                </div>
              </div>
              <div><strong>Received At:</strong> {emailData.receivedAt}</div>
              <div><strong>Is Read:</strong> {emailData.isRead ? 'true' : 'false'}</div>
              <div><strong>Is Archived:</strong> {emailData.isArchived ? 'true' : 'false'}</div>
              <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
                <strong>Star Status:</strong>
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <div><strong>DB Star Count (from thread):</strong> {gmailStarStatus?.dbStarCount ?? 'loading...'}</div>
                  <div><strong>Email Star Count (from email object):</strong> {emailData.starCount || 0}</div>
                  {loadingStarStatus && <div>Loading Gmail data...</div>}
                  {gmailStarStatus?.gmailStarStatus && (
                    <>
                      <div><strong>Gmail Latest Message Is Starred:</strong> {gmailStarStatus.gmailStarStatus.isStarred ? 'true' : 'false'}</div>
                      <div><strong>Gmail Latest Message Star Count:</strong> {gmailStarStatus.gmailStarStatus.starCount}</div>
                      <div><strong>Gmail Thread ID:</strong> {gmailStarStatus.gmailStarStatus.threadId}</div>
                      <div><strong>Gmail Latest Message Labels:</strong> {gmailStarStatus.gmailStarStatus.latestMessageLabelIds ? JSON.stringify(gmailStarStatus.gmailStarStatus.latestMessageLabelIds) : '[]'}</div>
                      <div style={{ marginTop: theme.spacing.xs }}>
                        <strong>All Messages in Thread:</strong>
                        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                          <div><strong>Any Message Starred:</strong> {gmailStarStatus.gmailStarStatus.isAnyStarred ? 'true' : 'false'}</div>
                          <div><strong>Starred Message Count:</strong> {gmailStarStatus.gmailStarStatus.starredMessageCount} / {gmailStarStatus.gmailStarStatus.messageStarStatuses?.length || 0}</div>
                          {gmailStarStatus.gmailStarStatus.messageStarStatuses && gmailStarStatus.gmailStarStatus.messageStarStatuses.length > 0 && (
                            <div style={{ marginTop: theme.spacing.xs }}>
                              {gmailStarStatus.gmailStarStatus.messageStarStatuses.map((msg: any, idx: number) => (
                                <div key={idx} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs, fontSize: theme.typography.fontSize.xs }}>
                                  [{msg.messageIndex}] Message ID: {msg.messageId.substring(0, 20)}... | Starred: {msg.isStarred ? '✓' : '✗'} | Labels: {JSON.stringify(msg.labelIds)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {gmailStarStatus.gmailStarStatus.error && (
                        <div style={{ color: '#d32f2f' }}><strong>Gmail Error:</strong> {gmailStarStatus.gmailStarStatus.error}</div>
                      )}
                      <div style={{ 
                        marginTop: theme.spacing.xs,
                        padding: theme.spacing.xs,
                        backgroundColor: gmailStarStatus.dbStarCount === gmailStarStatus.gmailStarStatus.starCount 
                          ? '#e8f5e9' 
                          : '#ffebee',
                        borderRadius: theme.borderRadius.sm,
                      }}>
                        <strong>Match Status:</strong> {gmailStarStatus.dbStarCount === gmailStarStatus.gmailStarStatus.starCount ? '✓ MATCH' : '✗ MISMATCH'}
                        <div style={{ marginTop: theme.spacing.xs, fontSize: theme.typography.fontSize.xs }}>
                          DB expects: {gmailStarStatus.dbStarCount > 0 ? 'Starred' : 'Not Starred'} | Gmail shows: {gmailStarStatus.gmailStarStatus.isAnyStarred ? 'Starred' : 'Not Starred'} ({gmailStarStatus.gmailStarStatus.starredMessageCount} message{gmailStarStatus.gmailStarStatus.starredMessageCount !== 1 ? 's' : ''} starred)
                        </div>
                      </div>
                    </>
                  )}
                  {gmailStarStatus?.error && (
                    <div style={{ color: '#d32f2f' }}><strong>Error:</strong> {gmailStarStatus.error}</div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
                <strong>Labels:</strong>
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <div><strong>DB Labels (from email):</strong> {emailData.labels ? JSON.stringify(emailData.labels) : '[]'}</div>
                  {loadingLabels && <div>Loading Gmail labels...</div>}
                  {gmailLabels && (
                    <>
                      <div><strong>DB Labels (decrypted):</strong> {gmailLabels.dbLabels ? JSON.stringify(gmailLabels.dbLabels) : 'null'}</div>
                      <div><strong>Gmail Labels (from API):</strong> {gmailLabels.gmailLabels?.labelIds ? JSON.stringify(gmailLabels.gmailLabels.labelIds) : '[]'}</div>
                      <div><strong>Gmail Message ID:</strong> {gmailLabels.gmailLabels?.messageId || 'N/A'}</div>
                      {gmailLabels.gmailLabels?.error && (
                        <div style={{ color: '#d32f2f' }}><strong>Gmail Error:</strong> {gmailLabels.gmailLabels.error}</div>
                      )}
                      <div style={{ 
                        marginTop: theme.spacing.xs,
                        padding: theme.spacing.xs,
                        backgroundColor: JSON.stringify(gmailLabels.dbLabels || []) === JSON.stringify(gmailLabels.gmailLabels?.labelIds || [])
                          ? '#e8f5e9' 
                          : '#ffebee',
                        borderRadius: theme.borderRadius.sm,
                      }}>
                        <strong>Match Status:</strong> {JSON.stringify(gmailLabels.dbLabels || []) === JSON.stringify(gmailLabels.gmailLabels?.labelIds || []) ? '✓ MATCH' : '✗ MISMATCH'}
                      </div>
                    </>
                  )}
                  {gmailLabels?.error && (
                    <div style={{ color: '#d32f2f' }}><strong>Error:</strong> {gmailLabels.error}</div>
                  )}
                </div>
              </div>
              {threadEmails && threadEmails.length > 0 && (
                <div style={{ marginTop: theme.spacing.md }}>
                  <strong>Thread Emails ({threadEmails.length}):</strong>
                  {threadEmails.map((threadEmail, idx) => {
                    const threadEmailData = threadEmail as any;
                    return (
                      <div key={threadEmail.id} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                        [{idx}] ID: {threadEmailData.id} | Labels: {threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : '[]'} | Received: {threadEmailData.receivedAt}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
                <strong>Attachments:</strong>
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <div><strong>Has Attachments Property:</strong> {emailData.attachments !== undefined ? 'true' : 'false'}</div>
                  <div><strong>Attachments Count:</strong> {emailData.attachments?.length ?? 0}</div>
                  <div><strong>Raw Attachments Data:</strong> {emailData.attachments ? JSON.stringify(emailData.attachments) : 'null/undefined'}</div>
                  {emailData.attachments && emailData.attachments.length > 0 && (
                    <div style={{ marginTop: theme.spacing.xs }}>
                      <strong>Attachment Details:</strong>
                      {emailData.attachments.map((attachment: any, idx: number) => (
                        <div key={attachment.attachmentId || idx} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                          [{idx}] ID: {attachment.attachmentId || 'N/A'} | Filename: {attachment.filename || 'N/A'} | MIME: {attachment.mimeType || 'N/A'} | Size: {attachment.size ?? 'N/A'} bytes
                        </div>
                      ))}
                    </div>
                  )}
                  {(!emailData.attachments || emailData.attachments.length === 0) && (
                    <div style={{ 
                      marginTop: theme.spacing.xs,
                      padding: theme.spacing.xs,
                      backgroundColor: '#ffebee',
                      borderRadius: theme.borderRadius.sm,
                      color: '#d32f2f',
                    }}>
                      No attachments found on email object. Check if attachments are being fetched from Gmail API and stored in database.
                    </div>
                  )}
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



