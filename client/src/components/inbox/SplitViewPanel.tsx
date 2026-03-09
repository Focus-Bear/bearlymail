import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive, FiClock, FiCornerUpLeft, FiCornerUpRight, FiMaximize2, FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';

import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { LETTER_SPACING_WIDER, MODE_ACTION, STRING_NONE } from 'constants/strings';
import EmailDetail from 'pages/EmailDetail';

import { useSplitViewPanelState } from './useSplitViewPanelState';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '\u{1F60A}', value: 1 },
  { label: 'Get on it', emoji: '\u{1F600}', value: 2 },
  { label: 'Oh sh$t', emoji: '\u{1F92F}', value: 3 },
] as const;

interface SelectedEmail {
  subject: string;
  from: string;
  fromName?: string;
}

interface SplitViewPanelProps {
  selectedEmailId: string;
  selectedEmail?: SelectedEmail;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  emailDetailRef: RefObject<HTMLDivElement | null>;
  onTogglePanel: () => void;
  onClose: () => void;
  onArchiveComplete?: (emailId: string) => void;
  onSnoozeComplete?: (emailId: string) => void;
  onPrioritySet?: (emailId: string, starCount: number) => void;
  mode?: InboxMode;
}

interface SplitViewTitleBarProps {
  selectedEmail: any;
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
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSnoozeClick: () => void;
  t: (key: string) => string;
}

const SplitViewActionButtons: React.FC<SplitViewActionButtonsProps> = ({
  showSnoozeInput,
  onReply,
  onForward,
  onArchive,
  onSnoozeClick,
  t,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
    <button
      onClick={onReply}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        backgroundColor: theme.colors.text.primary,
        color: theme.colors.background.paper,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
      }}
      title={t('emailDetail.replyAll')}
    >
      <FiCornerUpLeft size={15} />
      {t('emailDetail.replyAll')}
    </button>
    <button
      onClick={onForward}
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
      title={t('emailDetail.forward')}
    >
      <FiCornerUpRight size={15} />
      {t('emailDetail.forward')}
    </button>
    <div style={{ width: '1px', height: '28px', backgroundColor: theme.colors.border.light, flexShrink: 0 }} />
    <button
      onClick={onArchive}
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
      title={t('emailDetail.archive')}
    >
      <FiArchive size={15} />
      {t('emailDetail.archive')}
    </button>
    <button
      onClick={onSnoozeClick}
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
      title={t('emailDetail.snooze')}
    >
      <FiClock size={15} />
      {t('emailDetail.snooze')}
    </button>
  </div>
);

interface SplitViewPriorityBarProps {
  selectedEmailId: string;
  starCount: number;
  onSetStarCount: (id: string, count: number) => Promise<void>;
  t: (key: string) => string;
}

const SplitViewPriorityBar: React.FC<SplitViewPriorityBarProps> = ({ selectedEmailId, starCount, onSetStarCount, t }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      borderTop: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <span
      style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
        fontWeight: theme.typography.fontWeight.semibold,
        letterSpacing: LETTER_SPACING_WIDER,
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {t('inbox.prioritise')}
    </span>
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
      {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
        const isActive = starCount === value;
        return (
          <button
            key={value}
            onClick={event => {
              event.stopPropagation();
              onSetStarCount(selectedEmailId, starCount === value ? 0 : value);
            }}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: isActive ? theme.colors.text.primary : 'transparent',
              color: isActive ? theme.colors.background.paper : theme.colors.text.secondary,
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
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

interface SplitViewPanelHeaderProps {
  selectedEmail: any;
  senderName: string;
  subject: string;
  selectedEmailId: string;
  starCount: number;
  showSnoozeInput: boolean;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSnoozeClick: () => void;
  onClose: () => void;
  onOpenInNewTab: () => void;
  onSetStarCount: (id: string, count: number) => Promise<void>;
  t: (tKey: string) => string;
}

const SplitViewPanelHeader: React.FC<SplitViewPanelHeaderProps> = ({
  selectedEmail,
  senderName,
  subject,
  selectedEmailId,
  starCount,
  showSnoozeInput,
  onReply,
  onForward,
  onArchive,
  onSnoozeClick,
  onClose,
  onOpenInNewTab,
  onSetStarCount,
  t,
}) => (
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
        onReply={onReply}
        onForward={onForward}
        onArchive={onArchive}
        onSnoozeClick={onSnoozeClick}
        t={t}
      />
      <SplitViewPriorityBar
        selectedEmailId={selectedEmailId}
        starCount={starCount}
        onSetStarCount={onSetStarCount}
        t={t}
      />
    </div>
  </div>
);

export const SplitViewPanel: React.FC<SplitViewPanelProps> = ({
  selectedEmailId,
  selectedEmail,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  onTogglePanel: _onTogglePanel,
  onClose,
  onArchiveComplete,
  onSnoozeComplete,
  onPrioritySet,
  mode,
}) => {
  const { t } = useTranslation();
  const {
    emailDetailComponentRef,
    starCount,
    correspondentName,
    showSnoozeInput,
    snoozeValue,
    setSnoozeValue,
    handleCorrespondentChange,
    handleReplyClick,
    handleForwardClick,
    handleArchiveClick,
    handleSetStarCountForSlider,
    handleSnoozeClick,
    handleSnoozeConfirm,
    handleSnoozeCancel,
  } = useSplitViewPanelState({ selectedEmailId, selectedEmail, mode, onPrioritySet });

  const senderName = correspondentName || selectedEmail?.fromName || selectedEmail?.from || '';
  const subject = selectedEmail?.subject || t('inbox.emailDetails');


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
      <SplitViewPanelHeader
        selectedEmail={selectedEmail}
        senderName={senderName}
        subject={subject}
        selectedEmailId={selectedEmailId}
        starCount={starCount}
        showSnoozeInput={showSnoozeInput}
        onReply={handleReplyClick}
        onForward={handleForwardClick}
        onArchive={handleArchiveClick}
        onSnoozeClick={handleSnoozeClick}
        onClose={onClose}
        onOpenInNewTab={() => window.open(`/email/${selectedEmailId}`, '_blank')}
        onSetStarCount={handleSetStarCountForSlider}
        t={t}
      />
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
            onValueChange={setSnoozeValue}
            onConfirm={handleSnoozeConfirm}
            onCancel={handleSnoozeCancel}
          />
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <EmailDetail
          ref={emailDetailComponentRef}
          emailId={selectedEmailId}
          compactMode
          onArchiveComplete={onArchiveComplete}
          onSnoozeComplete={onSnoozeComplete}
          autoGenerateReplies={mode === MODE_ACTION}
          onCorrespondentChange={handleCorrespondentChange}
        />
      </div>
    </div>
  );
};
