import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { QuickActionsSection } from 'components/email-detail/QuickActionsSection';
import { CalendarInviteActions } from 'components/email-detail/CalendarInviteActions';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { EMOJI_REPLY, EMOJI_FORWARD, EMOJI_ARCHIVE, EMOJI_BLOCK, EMOJI_LINK, EMOJI_DELETE, EMOJI_STAR, EMOJI_CLOCK } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { REPLY_MODE_REPLY, REPLY_MODE_FORWARD } from 'constants/strings';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { captureEvent } from 'utils/posthog';
import { isCalendarInvitation } from 'utils/calendarUtils';

interface EmailDetailActionsProps {
  email: Email;
  suggestedActions: any[];
  showQuickActionsMenu: boolean;
  selectedAction: any;
  onShowQuickActionsMenu: () => void;
  onCloseQuickActionsMenu: () => void;
  onSelectAction: (action: any) => void;
  onCloseAction: () => void;
  onActionSuccess: () => void;
  onOpenReplyComposer: (mode: 'reply' | 'replyAll' | 'forward') => void;
  onArchive: () => void;
  onDelete: () => void;
  onSetStarCount: (emailId: string, starCount: number) => Promise<void>;
  onBlockSender: (emailId: string) => void;
  onSnooze: (duration: string) => void;
  onRespondToInvitation?: (emailId: string, response: 'accepted' | 'declined' | 'tentative') => Promise<void>;
  hideActionButtons?: boolean; // Hide the action buttons bar (used in split view where actions are in header)
}

export const EmailDetailActions: React.FC<EmailDetailActionsProps> = ({
  email,
  suggestedActions,
  showQuickActionsMenu,
  selectedAction,
  onShowQuickActionsMenu,
  onCloseQuickActionsMenu,
  onSelectAction,
  onCloseAction,
  onActionSuccess,
  onOpenReplyComposer,
  onArchive,
  onDelete,
  onSetStarCount,
  onBlockSender,
  onSnooze,
  onRespondToInvitation,
  hideActionButtons = false,
}) => {
  const { t } = useTranslation();
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');
  
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;

  // Check if email is a calendar invitation
  const isInvitation = useMemo(() => isCalendarInvitation(email), [email]);

  // Extract unsubscribe link from email
  const unsubscribeLink = useMemo(() => {
    const htmlBody = (email as any).htmlBody;
    return extractUnsubscribeLink(htmlBody, email.body);
  }, [email]);

  const handleUnsubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unsubscribeLink) {
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent('email_unsubscribe_clicked', { email_id: email.id });
    }
  };

  return (
    <div style={{
      marginBottom: theme.spacing.xl,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.md,
    }}>
      {/* Calendar Invitation Actions - shown prominently when email is an invitation */}
      {isInvitation && onRespondToInvitation && (
        <CalendarInviteActions
          email={email}
          onAccept={() => onRespondToInvitation(email.id, 'accepted')}
          onDecline={() => onRespondToInvitation(email.id, 'declined')}
        />
      )}

      <QuickActionsSection
        suggestedActions={suggestedActions}
        showQuickActionsMenu={showQuickActionsMenu}
        selectedAction={selectedAction}
        email={email}
        onShowMenu={onShowQuickActionsMenu}
        onCloseMenu={onCloseQuickActionsMenu}
        onSelectAction={onSelectAction}
        onCloseAction={onCloseAction}
        onActionSuccess={onActionSuccess}
      />

      {/* All Actions in Single Row - hidden in split view mode where actions are in header */}
      {!hideActionButtons && (
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.md,
        display: 'flex',
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Prioritise section */}
        <div style={{ 
          display: 'flex', 
          gap: theme.spacing.xs, 
          alignItems: 'center' 
        }}>
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            fontWeight: theme.typography.fontWeight.medium,
            whiteSpace: 'nowrap',
          }}>
            {t('inbox.prioritise') || 'Prioritise'}:
          </div>
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              onClick={(e) => {
                e.stopPropagation();
                const newCount = starCount === count ? 0 : count;
                onSetStarCount(email.id, newCount);
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

        {/* Other Actions */}
        <div style={{ 
          display: 'flex', 
          gap: theme.spacing.sm, 
          alignItems: 'center',
          flexWrap: 'wrap',
          marginLeft: 'auto',
        }}>
          <button
            onClick={() => onOpenReplyComposer(REPLY_MODE_REPLY)}
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
            <span>{EMOJI_REPLY}</span>
            {t('emailDetail.reply')}
          </button>

          <button
            onClick={() => onOpenReplyComposer(REPLY_MODE_FORWARD)}
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

          <button
            onClick={() => {
              console.log('%c[ARCHIVE DEBUG] EmailDetailActions Archive button clicked!', 'background: purple; color: white; font-size: 20px;');
              console.log('%c[ARCHIVE DEBUG] onArchive function:', 'background: orange; color: black; font-size: 16px;', typeof onArchive);
              onArchive();
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

          <button
            onClick={() => {
              captureEvent('email_snooze_clicked', { email_id: email.id });
              setShowSnoozeInput(!showSnoozeInput);
            }}
            title={t('emailDetail.snooze')}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: showSnoozeInput ? theme.colors.primary.light : 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${showSnoozeInput ? theme.colors.primary.main : theme.colors.border.medium}`,
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
            <span>{EMOJI_CLOCK}</span>
            {t('emailDetail.snooze')}
          </button>

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
          ) : (
            <button
              onClick={() => onBlockSender(email.id)}
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
          )}

        </div>

        {/* Snooze input row - shown below main actions when snooze is active */}
        {showSnoozeInput && (
          <div style={{
            borderTop: `1px solid ${theme.colors.border.light}`,
            paddingTop: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}>
            <SnoozeInputForm
              email={email}
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
      </div>
      )}
    </div>
  );
};
