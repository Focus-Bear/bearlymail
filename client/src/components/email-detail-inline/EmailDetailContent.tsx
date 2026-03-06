import React, { useEffect,useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import axios from 'axios';
import { theme } from 'theme/theme';
import { extractEmailAddress } from 'utils/emailUtils';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { CRMDealsSection } from 'components/crm/CRMDealsSection';
import { EmailDetailBody, EmailThreadList } from 'components/email-detail';
import { EmailAttachments } from 'components/email-detail/EmailAttachments';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { AdminDebugPanel } from 'components/email-detail-inline/EmailDetailDebugPanel';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { LETTER_SPACING_WIDER, STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const PRIORITY_OPTIONS = [ { label: 'Can wait', emoji: '😊', value: 1 }, { label: 'Get on it', emoji: '😀', value: 2 }, { label: 'Oh sh$t', emoji: '🤯', value: 3 }, ];

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
  attachments?: Array<{ attachmentId: string; filename: string; mimeType: string; size: number; }>;
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

const PriorityButtonRow: React.FC<{
  t: (key: string) => string;
  emailId: string;
  starCount: number;
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
}> = ({ t, emailId, starCount, onSetStarCount }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.sm, borderTop: `1px solid ${theme.colors.border.light}` }}>
    <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, fontWeight: theme.typography.fontWeight.semibold, letterSpacing: LETTER_SPACING_WIDER, textTransform: 'uppercase', flexShrink: 0 }}>
      {t('inbox.prioritise')}
    </span>
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
      {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
        const isActive = starCount === value;
        const newCount = isActive ? 0 : value;
        return (
          <button key={value} onClick={(e) => { e.stopPropagation(); onSetStarCount(emailId, newCount, e); }} style={{ padding: `${theme.spacing.xs} ${theme.spacing.md}`, backgroundColor: isActive ? theme.colors.text.primary : 'transparent', color: isActive ? 'white' : theme.colors.text.secondary, border: `1px solid ${isActive ? theme.colors.text.primary : theme.colors.border.medium}`, borderRadius: theme.borderRadius.full || '999px', cursor: 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}>
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

interface EmailActionButtonsProps {
  emailId: string;
  showSnoozeInput: boolean;
  unsubscribeLink: string | null;
  onSetStarCount?: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
  onOpenReplyComposer?: (mode: 'reply' | 'replyAll' | 'forward') => void;
  onArchive?: (emailId: string, e: React.MouseEvent) => void;
  onBlockSender?: (emailId: string) => void;
  onSnooze?: (duration: string) => void;
  onToggleSnooze: () => void;
  onUnsubscribeClick: (e: React.MouseEvent) => void;
  onBlockSenderClick: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}

const EmailActionButtons: React.FC<EmailActionButtonsProps> = ({
  emailId, showSnoozeInput, unsubscribeLink,
  onOpenReplyComposer, onArchive, onSnooze,
  onToggleSnooze, onUnsubscribeClick, onBlockSenderClick, onBlockSender, t,
}) => (
  <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: theme.spacing.md }}>
    {onOpenReplyComposer && (
      <button onClick={(e) => { e.stopPropagation(); onOpenReplyComposer('replyAll'); }} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: theme.colors.text.primary, color: COLOR_NAMED_WHITE, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.semibold, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <FiCornerUpLeft size={15} /> {t('emailDetail.replyAll')}
      </button>
    )}
    {onOpenReplyComposer && (
      <button onClick={(e) => { e.stopPropagation(); onOpenReplyComposer('forward'); }} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: COLOR_TRANSPARENT, color: theme.colors.text.secondary, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <FiCornerUpRight size={15} /> {t('emailDetail.forward')}
      </button>
    )}
    {(onArchive || onSnooze) && onOpenReplyComposer && <div style={{ width: '1px', height: '28px', backgroundColor: theme.colors.border.light, flexShrink: 0 }} />}
    {onArchive && (
      <button onClick={(e) => { e.stopPropagation(); onArchive(emailId, e); }} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: COLOR_TRANSPARENT, color: theme.colors.text.secondary, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <FiArchive size={15} /> {t('emailDetail.archive')}
      </button>
    )}
    {onSnooze && (
      <button onClick={(e) => { e.stopPropagation(); captureEvent('email_snooze_clicked', { email_id: emailId }); onToggleSnooze(); }} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: showSnoozeInput ? theme.colors.primary.light : 'transparent', color: theme.colors.text.secondary, border: showSnoozeInput ? `1px solid ${theme.colors.primary.main}` : 'none', borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <FiClock size={15} /> {t('emailDetail.snooze')}
      </button>
    )}
    {unsubscribeLink ? (
      <button onClick={onUnsubscribeClick} title={t('inbox.unsubscribe')} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: COLOR_TRANSPARENT, color: theme.colors.text.secondary, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs, opacity: OPACITY_DISABLED, marginLeft: 'auto' }}>
        <span>{EMOJI_LINK}</span><span>{t('inbox.unsubscribe')}</span>
      </button>
    ) : (onBlockSender && (
      <button onClick={onBlockSenderClick} title={t('inbox.blockSender')} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: COLOR_TRANSPARENT, color: theme.colors.text.secondary, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: theme.spacing.xs, opacity: OPACITY_DISABLED, marginLeft: 'auto' }}>
        <span>{EMOJI_BLOCK}</span><span>{t('inbox.blockSender')}</span>
      </button>
    ))}
  </div>
);

interface EmailContentActionBarProps {
  email: Email;
  emailId: string;
  starCount: number;
  onSetStarCount?: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
  onOpenReplyComposer?: (mode: 'reply' | 'replyAll' | 'forward') => void;
  onArchive?: (emailId: string, e: React.MouseEvent) => void;
  onBlockSender?: (emailId: string) => void;
  onSnooze?: (duration: string) => void;
}

const EmailContentActionBar: React.FC<EmailContentActionBarProps> = ({
  email, emailId, starCount,
  onSetStarCount, onOpenReplyComposer, onArchive, onBlockSender, onSnooze,
}) => {
  const { t } = useTranslation();
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');

  const emailWithStarCount = email as any;
  const unsubscribeLink = useMemo(() => extractUnsubscribeLink(emailWithStarCount?.htmlBody, email.body), [emailWithStarCount?.htmlBody, email.body]);
  const hasActions = [onSetStarCount, onOpenReplyComposer, onArchive, onBlockSender, unsubscribeLink, onSnooze].some(Boolean);

  const handleUnsubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unsubscribeLink) { window.open(unsubscribeLink, '_blank', 'noopener,noreferrer'); captureEvent('email_unsubscribe_clicked', { email_id: emailId }); }
  };

  const handleBlockSenderClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBlockSender) { onBlockSender(emailId); } else {
      captureEvent('email_block_sender_clicked', { email_id: emailId });
      try { await axios.post(`${API_URL}/emails/${emailId}/block-sender`); } catch (error) { console.error('Error blocking sender:', error); }
    }
  };

  if (!hasActions) return null;

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <EmailActionButtons emailId={emailId} showSnoozeInput={showSnoozeInput} unsubscribeLink={unsubscribeLink} onSetStarCount={onSetStarCount} onOpenReplyComposer={onOpenReplyComposer} onArchive={onArchive} onBlockSender={onBlockSender} onSnooze={onSnooze} onToggleSnooze={() => setShowSnoozeInput(!showSnoozeInput)} onUnsubscribeClick={handleUnsubscribeClick} onBlockSenderClick={handleBlockSenderClick} t={t} />
      {showSnoozeInput && onSnooze && (
        <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
          <SnoozeInputForm email={email as any} snoozeValue={snoozeValue} onValueChange={setSnoozeValue} onConfirm={() => { onSnooze(snoozeValue); setShowSnoozeInput(false); setSnoozeValue(''); }} onCancel={() => { setShowSnoozeInput(false); setSnoozeValue(''); }} />
        </div>
      )}
      {onSetStarCount && <PriorityButtonRow t={t} emailId={emailId} starCount={starCount} onSetStarCount={onSetStarCount} />}
    </div>
  );
};

const useEmailAdminData = (emailId: string, isAdmin: boolean) => {
  const [gmailStarStatus, setGmailStarStatus] = useState<any>(null);
  const [loadingStarStatus, setLoadingStarStatus] = useState(false);
  const [gmailLabels, setGmailLabels] = useState<any>(null);
  const [loadingLabels, setLoadingLabels] = useState(false);

  useEffect(() => {
    if (!isAdmin || !emailId) return;
    setLoadingStarStatus(true);
    axios.get(`${API_URL}/emails/${emailId}/gmail-star-status`)
      .then(response => { setGmailStarStatus(response.data); setLoadingStarStatus(false); })
      .catch(error => { console.error('Error fetching Gmail star status:', error); setGmailStarStatus({ error: error.message }); setLoadingStarStatus(false); });
    setLoadingLabels(true);
    axios.get(`${API_URL}/emails/${emailId}/gmail-labels`)
      .then(response => { setGmailLabels(response.data); setLoadingLabels(false); })
      .catch(error => { console.error('Error fetching Gmail labels:', error); setGmailLabels({ error: error.message }); setLoadingLabels(false); });
  }, [isAdmin, emailId]);

  return { gmailStarStatus, loadingStarStatus, gmailLabels, loadingLabels };
};

export const EmailDetailContent: React.FC<EmailDetailContentProps> = ({
  email, emailId, threadEmails, expandedThreadItems,
  noteContent, notesCollapsed, actionItems, newActionItem, isGeneratingSummary,
  githubLinks, loadingGithub, hasGithubToken,
  onNoteContentChange, onToggleNotesCollapsed, onSaveNote,
  onNewActionItemChange, onAddActionItem, onToggleActionItem, onDeleteActionItem, onExtractActions,
  onRefreshGithub, onToggleThreadItem, onArchive, onSetStarCount, onOpenReplyComposer, onBlockSender, onSnooze,
}) => {
  const { user } = useAuth();
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;
  const { gmailStarStatus, loadingStarStatus, gmailLabels, loadingLabels } = useEmailAdminData(emailId, Boolean(user?.isAdmin));

  return (
    <div style={{ padding: theme.spacing.xl, height: '100%', overflowY: 'auto' }}>
      <EmailContentActionBar email={email} emailId={emailId} starCount={starCount} onSetStarCount={onSetStarCount} onOpenReplyComposer={onOpenReplyComposer} onArchive={onArchive} onBlockSender={onBlockSender} onSnooze={onSnooze} />
      <div style={{ marginBottom: theme.spacing.xl }}>
        <PrivateNotesSection noteContent={noteContent} notesCollapsed={notesCollapsed} onNoteContentChange={onNoteContentChange} onToggleCollapsed={onToggleNotesCollapsed} onSaveNote={onSaveNote} />
        <ActionItemsSection actionItems={actionItems} newActionItem={newActionItem} isGeneratingSummary={isGeneratingSummary} onNewActionItemChange={onNewActionItemChange} onAddActionItem={onAddActionItem} onToggleActionItem={onToggleActionItem} onDeleteActionItem={onDeleteActionItem} onExtractActions={onExtractActions} />
        {hasGithubToken && <GitHubStatusSection links={githubLinks} loading={loadingGithub} hasToken={hasGithubToken} onRefresh={onRefreshGithub} emailSubject={email.subject} emailBody={email.body} emailHtmlBody={email.htmlBody} />}
        <CRMDealsSection senderEmail={extractEmailAddress(email.from)} emailSubject={email.subject} />
      </div>
      <EmailThreadList threadEmails={threadEmails} currentEmailId={emailId} expandedThreadItems={expandedThreadItems} onToggleThreadItem={onToggleThreadItem} />
      <EmailDetailBody body={email.body} htmlBody={email.htmlBody || undefined} />
      {email.attachments && email.attachments.length > 0 && <EmailAttachments emailId={emailId} attachments={email.attachments} />}
      {user?.isAdmin && email && <AdminDebugPanel emailData={email as any} gmailLabels={gmailLabels} gmailStarStatus={gmailStarStatus} loadingLabels={loadingLabels} loadingStarStatus={loadingStarStatus} />}
    </div>
  );
};
