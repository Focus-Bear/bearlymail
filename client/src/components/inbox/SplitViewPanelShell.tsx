/**
 * SplitViewPanelShell — presentational shell extracted from SplitViewPanel.
 *
 * Renders the panel header, the action toolbar (with the priority chip at its right edge), and the snooze form.
 * The email detail body is injected via `children` (slot), making this component
 * directly importable in Storybook without any routing or API dependencies.
 *
 * The container `SplitViewPanel` wraps this shell and passes <EmailDetail> as children.
 */
import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight, FiMaximize2, FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { PriorityChip } from 'components/priority/PriorityChip';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface SelectedEmail {
  subject: string;
  from: string;
  fromName?: string;
}

// ---- Sub-components (same as in SplitViewPanel) ----

interface SplitViewTitleBarProps {
  selectedEmail: SelectedEmail | undefined;
  senderName: string;
  subject: string;
  onClose: () => void;
  onOpenInNewTab: () => void;
  t: (key: string) => string;
}

const SplitViewTitleBar: React.FC<SplitViewTitleBarProps> = ({
  selectedEmail,
  senderName,
  subject,
  onClose,
  onOpenInNewTab,
  t,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      gap: theme.spacing.sm,
      minHeight: '40px',
    }}
  >
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      {selectedEmail ? (
        <>
          <span
            style={{
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '200px',
            }}
          >
            {senderName}
          </span>
          <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>—</span>
          <span
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subject}
          </span>
        </>
      ) : (
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('inbox.emailDetails')}
        </span>
      )}
    </div>
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexShrink: 0 }}>
      <button
        onClick={onOpenInNewTab}
        style={{
          padding: theme.spacing.xs,
          backgroundColor: COLOR_TRANSPARENT,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          color: theme.colors.text.secondary,
          display: 'flex',
          alignItems: 'center',
        }}
        title={t('inbox.openInNewTab')}
      >
        <FiMaximize2 size={16} />
      </button>
      <button
        onClick={onClose}
        style={{
          padding: theme.spacing.xs,
          backgroundColor: COLOR_TRANSPARENT,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          color: theme.colors.text.secondary,
          display: 'flex',
          alignItems: 'center',
        }}
        title={t('inbox.closePanel')}
      >
        <FiX size={16} />
      </button>
    </div>
  </div>
);

interface SplitViewActionButtonsProps {
  showSnoozeInput: boolean;
  selectedEmailId: string;
  starCount: number;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSnoozeClick: () => void;
  onSetStarCount: (id: string, count: number) => Promise<void>;
  t: (key: string) => string;
}

// Shared base so every action button has identical height, radius, and motion —
// only the colour treatment (primary vs ghost) differs.
const actionButtonBase: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  transition: theme.transitions.fast,
  whiteSpace: 'nowrap',
};

const primaryActionStyle: React.CSSProperties = {
  ...actionButtonBase,
  backgroundColor: theme.colors.text.primary,
  color: theme.colors.background.paper,
  border: STRING_NONE,
  fontWeight: theme.typography.fontWeight.semibold,
};

const ghostActionStyle: React.CSSProperties = {
  ...actionButtonBase,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.light}`,
  fontWeight: theme.typography.fontWeight.medium,
};

const snoozeActiveStyle: React.CSSProperties = {
  ...ghostActionStyle,
  backgroundColor: theme.colors.primary.subtle,
  color: theme.colors.primary.main,
  border: `1px solid ${theme.colors.primary.main}`,
};

const SplitViewActionButtons: React.FC<SplitViewActionButtonsProps> = ({
  showSnoozeInput,
  selectedEmailId,
  starCount,
  onReply,
  onForward,
  onArchive,
  onSnoozeClick,
  onSetStarCount,
  t,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
    <button onClick={onReply} style={primaryActionStyle} title={t('emailDetail.replyAll')}>
      <FiCornerUpLeft size={15} />
      {t('emailDetail.replyAll')}
    </button>
    <button onClick={onForward} style={ghostActionStyle} title={t('emailDetail.forward')}>
      <FiCornerUpRight size={15} />
      {t('emailDetail.forward')}
    </button>
    <button onClick={onArchive} style={ghostActionStyle} title={t('emailDetail.archive')}>
      <FiArchive size={15} />
      {t('emailDetail.archive')}
    </button>
    <button
      onClick={onSnoozeClick}
      style={showSnoozeInput ? snoozeActiveStyle : ghostActionStyle}
      title={t('emailDetail.snooze')}
    >
      <FiClock size={15} />
      {t('emailDetail.snooze')}
    </button>
    {/* Priority sits at the top right of the toolbar on desktop (wrapping below on narrow
        panels) rather than on its own labelled row. Menu anchors right to stay on-screen. */}
    <div style={{ marginLeft: 'auto' }}>
      <PriorityChip
        inlineLabel
        menuAlign="right"
        starCount={starCount}
        onSelect={newCount => onSetStarCount(selectedEmailId, newCount)}
      />
    </div>
  </div>
);

// ---- Public interface ----

export interface SplitViewPanelShellProps {
  selectedEmailId: string;
  selectedEmail?: SelectedEmail;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  emailDetailRef?: RefObject<HTMLDivElement | null>;
  senderName: string;
  subject: string;
  starCount: number;
  showSnoozeInput: boolean;
  snoozeValue: string;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSnoozeClick: () => void;
  onSnoozeValueChange: (value: string) => void;
  onSnoozeConfirm: () => void;
  onSnoozeCancel: () => void;
  onClose: () => void;
  onOpenInNewTab: () => void;
  onSetStarCount: (emailId: string, count: number) => Promise<void>;
  /** Slot for the email detail body — inject <EmailDetail> in production, a mock in stories */
  children: React.ReactNode;
}

export const SplitViewPanelShell: React.FC<SplitViewPanelShellProps> = ({
  selectedEmailId,
  selectedEmail,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  senderName,
  subject,
  starCount,
  showSnoozeInput,
  snoozeValue,
  onReply,
  onForward,
  onArchive,
  onSnoozeClick,
  onSnoozeValueChange,
  onSnoozeConfirm,
  onSnoozeCancel,
  onClose,
  onOpenInNewTab,
  onSetStarCount,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <div
      ref={emailDetailRef}
      tabIndex={0}
      style={{
        flex: panelExpanded ? 1 : `0 0 ${100 - splitPosition}%`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        borderLeft: `1px solid ${theme.colors.border.light}`,
        transition: isResizing ? 'none' : 'flex 0.3s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.background.subtle,
        }}
      >
        <SplitViewTitleBar
          selectedEmail={selectedEmail}
          senderName={senderName}
          subject={subject}
          onClose={onClose}
          onOpenInNewTab={onOpenInNewTab}
          t={t}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xs,
            padding: `0 ${theme.spacing.md} ${theme.spacing.sm}`,
          }}
        >
          <SplitViewActionButtons
            showSnoozeInput={showSnoozeInput}
            selectedEmailId={selectedEmailId}
            starCount={starCount}
            onReply={onReply}
            onForward={onForward}
            onArchive={onArchive}
            onSnoozeClick={onSnoozeClick}
            onSetStarCount={onSetStarCount}
            t={t}
          />
        </div>
      </div>

      {/* Snooze input (conditionally shown) */}
      {showSnoozeInput && (
        <div
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            borderBottom: `1px solid ${theme.colors.border.light}`,
            backgroundColor: theme.colors.background.paper,
          }}
        >
          <SnoozeInputForm
            email={{ id: selectedEmailId } as Email}
            snoozeValue={snoozeValue}
            onValueChange={onSnoozeValueChange}
            onConfirm={onSnoozeConfirm}
            onCancel={onSnoozeCancel}
          />
        </div>
      )}

      {/* Email detail body (injected via children slot) */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>{children}</div>
    </div>
  );
};
