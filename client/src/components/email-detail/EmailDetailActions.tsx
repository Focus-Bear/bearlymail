import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight, FiPrinter } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { isCalendarInvitation } from 'utils/calendarUtils';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { OverflowMenu } from 'components/common/OverflowMenu';
import { CalendarInviteActions } from 'components/email-detail/CalendarInviteActions';
import { IcsInviteCard } from 'components/email-detail/IcsInviteCard';
import { PrintableThread } from 'components/email-detail/PrintableThread';
import { PriorityButtonRow } from 'components/email-detail/PriorityButtonRow';
import { QuickActionsSection } from 'components/email-detail/QuickActionsSection';
import { SchedulingRequestCard } from 'components/email-detail/SchedulingRequestCard';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { TOUCH_TARGET_MIN_PX } from 'constants/layout';
import { OPACITY_DISABLED } from 'constants/numbers';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_SCHEDULING_REQUEST,
  BUTTON_VARIANT_PRIMARY,
  BUTTON_VARIANT_SECONDARY,
  ICS_MIME_TYPE,
  REPLY_MODE_FORWARD,
  STRING_NONE,
} from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface EmailDetailActionsProps {
  email: Email;
  threadEmails?: Email[];
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

// ── Shared button-style helper ─────────────────────────────────────────────

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, the button expands to fill available space (flex: 1) and
   *  enforces the minimum 44 px touch target height. Used in the mobile layout. */
  mobile?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Extra inline styles merged on top of the base style. */
  extraStyle?: React.CSSProperties;
  children: React.ReactNode;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  mobile = false,
  variant = 'ghost',
  extraStyle,
  children,
  style: _ignoredStyle,
  ...rest
}) => {
  const baseStyle: React.CSSProperties = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    ...(mobile ? { flex: 1, minHeight: `${TOUCH_TARGET_MIN_PX}px` } : {}),
  };

  const variantStyle: React.CSSProperties =
    variant === BUTTON_VARIANT_PRIMARY
      ? {
          backgroundColor: theme.colors.text.primary,
          color: COLOR_NAMED_WHITE,
          fontWeight: theme.typography.fontWeight.semibold,
        }
      : variant === BUTTON_VARIANT_SECONDARY
        ? {
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            fontWeight: theme.typography.fontWeight.medium,
          }
        : /* ghost */ {
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            fontWeight: theme.typography.fontWeight.medium,
          };

  return (
    <button style={{ ...baseStyle, ...variantStyle, ...extraStyle }} {...rest}>
      {children}
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

export const EmailDetailActions: React.FC<EmailDetailActionsProps> = ({
  email,
  threadEmails = [],
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
  const { isMobile } = useResponsiveBreakpoints();
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');
  const overflowMenuItems = useMemo(
    () => [
      {
        key: 'saveAsPdf',
        label: t('emailDetail.saveAsPdf'),
        icon: <FiPrinter size={14} />,
        onClick: () => window.print(),
      },
    ],
    [t]
  );
  const starCount = email?.starCount ?? 0;

  const isInvitation = useMemo(() => isCalendarInvitation(email), [email]);

  // Deterministic ICS attachment detection — checked via MIME type and filename,
  // not via LLM. Takes priority over the generic SchedulingRequestCard.
  const hasIcsAttachment = useMemo(
    () =>
      Array.isArray(email.attachments) &&
      email.attachments.some(att => att.mimeType === ICS_MIME_TYPE || att.filename?.toLowerCase().endsWith('.ics')),
    [email.attachments]
  );

  // Derive hasSchedulingRequest from the pre-partitioned schedulingActions list (not from
  // suggestedActions, which now contains only non-GitHub, non-scheduling actions).
  // This ensures SchedulingRequestCard and QuickActionsSection are mutually exclusive.
  // Treat both scheduling_request and calendar_create_invite as scheduling triggers.
  const hasSchedulingRequest = useMemo(
    () =>
      schedulingActions.some(
        action => action.type === ACTION_TYPE_SCHEDULING_REQUEST || action.type === ACTION_TYPE_CALENDAR_CREATE_INVITE
      ),
    [schedulingActions]
  );

  const unsubscribeLink = useMemo(() => {
    return extractUnsubscribeLink(email.htmlBody, email.body);
  }, [email]);

  const handleUnsubscribeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (unsubscribeLink) {
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id });
    }
  };

  // ── Shared action buttons ──────────────────────────────────────────────────

  const replyAllButton = (
    <ActionButton
      mobile={isMobile}
      variant="primary"
      onClick={() => onOpenReplyComposer('replyAll')}
      extraStyle={isMobile ? {} : { justifyContent: 'flex-start' }}
    >
      <FiCornerUpLeft size={15} />
      {t('emailDetail.replyAll')}
    </ActionButton>
  );

  const forwardButton = (
    <ActionButton
      mobile={isMobile}
      variant="secondary"
      onClick={() => onOpenReplyComposer(REPLY_MODE_FORWARD)}
      extraStyle={isMobile ? {} : { justifyContent: 'flex-start' }}
    >
      <FiCornerUpRight size={15} />
      {t('emailDetail.forward')}
    </ActionButton>
  );

  const archiveButton = (
    <ActionButton
      mobile={isMobile}
      variant="ghost"
      onClick={onArchive}
      extraStyle={isMobile ? {} : { justifyContent: 'flex-start' }}
    >
      <FiArchive size={15} />
      {t('emailDetail.archive')}
    </ActionButton>
  );

  const snoozeButton = (
    <ActionButton
      mobile={isMobile}
      variant="ghost"
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CLICKED, { email_id: email.id });
        setShowSnoozeInput(!showSnoozeInput);
      }}
      title={t('emailDetail.snooze')}
      extraStyle={{
        ...(isMobile ? {} : { justifyContent: 'flex-start' }),
        backgroundColor: showSnoozeInput ? theme.colors.primary.light : COLOR_TRANSPARENT,
        border: showSnoozeInput ? `1px solid ${theme.colors.primary.main}` : STRING_NONE,
      }}
    >
      <FiClock size={15} />
      {t('emailDetail.snooze')}
    </ActionButton>
  );

  const unsubscribeOrBlockButton = unsubscribeLink ? (
    <ActionButton
      mobile={isMobile}
      variant="ghost"
      onClick={handleUnsubscribeClick}
      title={t('inbox.unsubscribe')}
      extraStyle={{
        opacity: OPACITY_DISABLED,
        ...(isMobile ? {} : { marginLeft: 'auto', justifyContent: 'flex-start' }),
      }}
    >
      <span>{EMOJI_LINK}</span>
      <span>{t('inbox.unsubscribe')}</span>
    </ActionButton>
  ) : (
    <ActionButton
      mobile={isMobile}
      variant="ghost"
      onClick={() => onBlockSender(email.id)}
      title={t('inbox.blockSender')}
      extraStyle={{
        opacity: OPACITY_DISABLED,
        ...(isMobile ? {} : { marginLeft: 'auto', justifyContent: 'flex-start' }),
      }}
    >
      <span>{EMOJI_BLOCK}</span>
      <span>{t('inbox.blockSender')}</span>
    </ActionButton>
  );

  return (
    <div
      style={{
        marginBottom: theme.spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {hasIcsAttachment && <IcsInviteCard email={email} />}
      {/* Meeting proposals take priority over generic calendar invitation detection.
          If the AI identified a scheduling request / calendar_create_invite action,
          show the SchedulingRequestCard (Create Calendar Invite) regardless of whether
          isCalendarInvitation() also fires on the same email.  Only fall back to
          CalendarInviteActions (Accept / Decline) when there is no meeting proposal. */}
      {!hasIcsAttachment && hasSchedulingRequest && (
        <SchedulingRequestCard email={email} onDraftReply={onDraftReply} />
      )}
      {!hasIcsAttachment && !hasSchedulingRequest && isInvitation && onRespondToInvitation && (
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
          {/* Action buttons — single row on desktop, two rows on mobile */}
          {isMobile ? (
            /* ── Mobile: two-row layout ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {/* Row 1: Reply All · Forward · ⋮ */}
              <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                {replyAllButton}
                {forwardButton}
                {/* Overflow menu (⋮) — 44×44px touch target */}
                <OverflowMenu items={overflowMenuItems} aria-label={t('emailDetail.moreOptions')} />
              </div>

              {/* Row 2: Archive · Snooze · Unsubscribe/Block */}
              <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                {archiveButton}
                {snoozeButton}
                {unsubscribeOrBlockButton}
              </div>
            </div>
          ) : (
            /* ── Desktop: original single-row layout ── */
            <div
              style={{
                display: 'flex',
                gap: theme.spacing.sm,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {replyAllButton}
              {forwardButton}

              {/* Separator */}
              <div
                style={{
                  width: '1px',
                  height: '28px',
                  backgroundColor: theme.colors.border.light,
                  flexShrink: 0,
                }}
              />

              {archiveButton}
              {snoozeButton}

              {/* Overflow menu (⋮) — Save as PDF and future actions */}
              <OverflowMenu items={overflowMenuItems} aria-label={t('emailDetail.moreOptions')} />

              {unsubscribeOrBlockButton}
            </div>
          )}

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

      {/* Hidden print-only thread renderer — shown by @media print in email-thread-print.css */}
      <PrintableThread email={email} threadEmails={threadEmails} />
    </div>
  );
};
