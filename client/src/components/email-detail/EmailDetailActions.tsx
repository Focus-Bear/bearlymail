import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { QuickActionsSection } from 'components/email-detail/QuickActionsSection';
import { CalendarInviteActions } from 'components/email-detail/CalendarInviteActions';
import { SchedulingRequestCard } from 'components/email-detail/SchedulingRequestCard';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { REPLY_MODE_FORWARD, ACTION_TYPE_SCHEDULING_REQUEST } from 'constants/strings';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { captureEvent } from 'utils/posthog';
import { isCalendarInvitation } from 'utils/calendarUtils';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '😊', value: 1 },
  { label: 'Get on it', emoji: '😀', value: 2 },
  { label: 'Oh sh$t', emoji: '🤯', value: 3 },
];

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
  onDraftReply?: (draft: string) => void;
  hideActionButtons?: boolean;
}

// eslint-disable-next-line max-lines-per-function
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
  onDraftReply,
  hideActionButtons = false,
}) => {
  const { t } = useTranslation();
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;

  const isInvitation = useMemo(() => isCalendarInvitation(email), [email]);

  const hasSchedulingRequest = useMemo(
    () => suggestedActions.some((a) => a.type === ACTION_TYPE_SCHEDULING_REQUEST),
    [suggestedActions],
  );

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
      {isInvitation && onRespondToInvitation && (
        <CalendarInviteActions
          email={email}
          onAccept={() => onRespondToInvitation(email.id, 'accepted')}
          onDecline={() => onRespondToInvitation(email.id, 'declined')}
        />
      )}

      {hasSchedulingRequest && !isInvitation && (
        <SchedulingRequestCard
          email={email}
          onDraftReply={onDraftReply}
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

      {!hideActionButtons && (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
          padding: theme.spacing.md,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.md,
        }}>
          {/* Action buttons row */}
          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            {/* Reply All */}
            <button
              onClick={() => onOpenReplyComposer('replyAll')}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.text.primary,
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
              <FiCornerUpLeft size={15} />
              {t('emailDetail.replyAll')}
            </button>

            {/* Forward */}
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
              <FiCornerUpRight size={15} />
              {t('emailDetail.forward')}
            </button>

            {/* Separator */}
            <div style={{
              width: '1px',
              height: '28px',
              backgroundColor: theme.colors.border.light,
              flexShrink: 0,
            }} />

            {/* Archive */}
            <button
              onClick={() => {
                console.log('%c[ARCHIVE DEBUG] EmailDetailActions Archive button clicked!', 'background: purple; color: white; font-size: 20px;');
                onArchive();
              }}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: 'transparent',
                color: theme.colors.text.secondary,
                border: 'none',
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

            {/* Snooze */}
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

            {/* Unsubscribe / Block Sender */}
            {unsubscribeLink ? (
              <button
                onClick={handleUnsubscribeClick}
                title={t('inbox.unsubscribe')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
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
            ) : (
              <button
                onClick={() => onBlockSender(email.id)}
                title={t('inbox.blockSender')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
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
            )}
          </div>

          {/* Snooze input */}
          {showSnoozeInput && (
            <div style={{
              borderTop: `1px solid ${theme.colors.border.light}`,
              paddingTop: theme.spacing.sm,
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

          {/* PRIORITIZE row */}
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
              letterSpacing: '0.08em',
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
                    onClick={() => {
                      const newCount = starCount === value ? 0 : value;
                      onSetStarCount(email.id, newCount);
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
        </div>
      )}
    </div>
  );
};
