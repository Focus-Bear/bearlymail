import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { isCalendarInvitation } from 'utils/calendarUtils';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { CalendarInviteActions } from 'components/email-detail/CalendarInviteActions';
import { PriorityButtonRow } from 'components/email-detail/PriorityButtonRow';
import { QuickActionsSection } from 'components/email-detail/QuickActionsSection';
import { SchedulingRequestCard } from 'components/email-detail/SchedulingRequestCard';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_SCHEDULING_REQUEST,
  REPLY_MODE_FORWARD,
  STRING_NONE,
} from 'constants/strings';

interface EmailDetailActionsProps {
  email: Email;
  suggestedActions: SuggestedAction[];
  /** Scheduling-specific suggested actions (scheduling_request, calendar_create_invite).
   *  Separated upstream so they never appear in QuickActionsSection alongside SchedulingRequestCard. */
  schedulingActions?: SuggestedAction[];
  showQuickActionsMenu: boolean;
  selectedAction: SuggestedAction | null;
  onShowQuickActionsMenu: () => void;
  onCloseQuickActionsMenu: () => void;
  onSelectAction: (action: SuggestedAction) => void;
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

export const EmailDetailActions: React.FC<EmailDetailActionsProps> = ({
  email,
  suggestedActions,
  schedulingActions = [],
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

  // Derive hasSchedulingRequest from the pre-partitioned schedulingActions list (not from
  // suggestedActions, which now contains only non-GitHub, non-scheduling actions).
  // This ensures SchedulingRequestCard and QuickActionsSection are mutually exclusive.
  const hasSchedulingRequest = useMemo(
    () =>
      schedulingActions.some(
        action =>
          action.type === ACTION_TYPE_SCHEDULING_REQUEST || action.type === ACTION_TYPE_CALENDAR_CREATE_INVITE,
      ),
    [schedulingActions]
  );

  const unsubscribeLink = useMemo(() => {
    const htmlBody = (email as any).htmlBody;
    return extractUnsubscribeLink(htmlBody, email.body);
  }, [email]);

  const handleUnsubscribeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (unsubscribeLink) {
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id });
    }
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {isInvitation && onRespondToInvitation && (
        <CalendarInviteActions
          email={email}
          onAccept={() => onRespondToInvitation(email.id, 'accepted')}
          onDecline={() => onRespondToInvitation(email.id, 'declined')}
        />
      )}

      {hasSchedulingRequest && !isInvitation && <SchedulingRequestCard email={email} onDraftReply={onDraftReply} />}

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
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
            padding: theme.spacing.md,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
          }}
        >
          {/* Action buttons row */}
          <div
            style={{
              display: 'flex',
              gap: theme.spacing.sm,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Reply All */}
            <button
              onClick={() => onOpenReplyComposer('replyAll')}
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

            {/* Forward */}
            <button
              onClick={() => onOpenReplyComposer(REPLY_MODE_FORWARD)}
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

            {/* Separator */}
            <div
              style={{
                width: '1px',
                height: '28px',
                backgroundColor: theme.colors.border.light,
                flexShrink: 0,
              }}
            />

            {/* Archive */}
            <button
              onClick={() => {
                console.log(
                  '%c[ARCHIVE DEBUG] EmailDetailActions Archive button clicked!',
                  'background: purple; color: white; font-size: 20px;'
                );
                onArchive();
              }}
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

            {/* Snooze */}
            <button
              onClick={() => {
                captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CLICKED, { email_id: email.id });
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
                <span>{EMOJI_LINK}</span>
                <span>{t('inbox.unsubscribe')}</span>
              </button>
            ) : (
              <button
                onClick={() => onBlockSender(email.id)}
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
                <span>{EMOJI_BLOCK}</span>
                <span>{t('inbox.blockSender')}</span>
              </button>
            )}
          </div>

          {/* Snooze input */}
          {showSnoozeInput && (
            <div
              style={{
                borderTop: `1px solid ${theme.colors.border.light}`,
                paddingTop: theme.spacing.sm,
              }}
            >
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

          {/* PRIORITIZE row — shared component (consolidated in #698) */}
          <PriorityButtonRow
            emailId={email.id}
            starCount={starCount}
            onSetStarCount={(emailId, newCount) => onSetStarCount(emailId, newCount)}
          />
        </div>
      )}
    </div>
  );
};
