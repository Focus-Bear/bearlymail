import React, { RefObject, useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import EmailDetail, { EmailDetailRef } from 'pages/EmailDetail';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { EMOJI_CLOSE, EMOJI_EXPAND, EMOJI_REPLY, EMOJI_FORWARD, EMOJI_ARCHIVE, EMOJI_STAR, EMOJI_CLOCK } from 'constants/emojis';
import { InboxMode, Email } from 'types/email';
import { MODE_ACTION } from 'constants/strings';
import { captureEvent } from 'utils/posthog';

const INACTIVE_PRIORITY_OPACITY = 0.4;

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

export const SplitViewPanel: React.FC<SplitViewPanelProps> = ({
  selectedEmailId,
  selectedEmail,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  onTogglePanel,
  onClose,
  onArchiveComplete,
  onSnoozeComplete,
  onPrioritySet,
  mode,
}) => {
  const { t } = useTranslation();
  const emailDetailComponentRef = useRef<EmailDetailRef>(null);
  const [starCount, setStarCount] = useState<number>((selectedEmail as any)?.starCount ?? 0);
  const [correspondentName, setCorrespondentName] = useState<string>('');
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');
  
  const senderName = correspondentName || selectedEmail?.fromName || selectedEmail?.from || '';
  const subject = selectedEmail?.subject || t('inbox.emailDetails');

  const handleCorrespondentChange = useCallback((correspondent: { name: string; email: string }) => {
    setCorrespondentName(correspondent.name);
  }, []);

  // Sync starCount and reset correspondent when selectedEmailId changes
  useEffect(() => {
    setStarCount((selectedEmail as any)?.starCount ?? 0);
    setCorrespondentName('');
  }, [selectedEmailId]);

  const handleReplyClick = () => {
    emailDetailComponentRef.current?.openReplyComposer('replyAll');
  };

  const handleForwardClick = () => {
    emailDetailComponentRef.current?.openReplyComposer('forward');
  };

  const handleArchiveClick = () => {
    emailDetailComponentRef.current?.archive();
  };

  const handleStarClick = (count: number) => {
    const newCount = starCount === count ? 0 : count;

    // In triage mode, setting star > 0 moves email to Action tab — delegate to parent
    // which triggers the exit animation on the list item and navigates to the next email
    if (mode === 'triage' && newCount > 0 && onPrioritySet) {
      onPrioritySet(selectedEmailId, newCount);
      return;
    }

    setStarCount(newCount);
    emailDetailComponentRef.current?.setStarCount(newCount);
  };

  const handleSnoozeClick = () => {
    captureEvent('email_snooze_clicked', { email_id: selectedEmailId });
    setShowSnoozeInput(!showSnoozeInput);
  };

  const handleSnoozeConfirm = () => {
    if (snoozeValue.trim()) {
      emailDetailComponentRef.current?.snooze(snoozeValue);
      setShowSnoozeInput(false);
      setSnoozeValue('');
    }
  };

  const handleSnoozeCancel = () => {
    setShowSnoozeInput(false);
    setSnoozeValue('');
  };
  
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
      {/* Panel Header with buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
      }}>
        {/* Top row: sender info + expand/close */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          gap: theme.spacing.sm,
          minHeight: '40px',
        }}>
          <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}>
            {selectedEmail ? (
              <>
                <span style={{
                  fontWeight: theme.typography.fontWeight.semibold,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.primary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '200px',
                }}>
                  {senderName}
                </span>
                <span style={{
                  color: theme.colors.text.tertiary,
                  fontSize: theme.typography.fontSize.sm,
                }}>
                  —
                </span>
                <span style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {subject}
                </span>
              </>
            ) : (
              <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                {t('inbox.emailDetails')}
              </span>
            )}
          </div>

          {/* Expand/Close buttons */}
          <div style={{ display: 'flex', gap: theme.spacing.xs, flexShrink: 0 }}>
            <button
              onClick={() => {
                window.open(`/email/${selectedEmailId}`, '_blank');
              }}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
              }}
              title={t('inbox.openInNewTab')}
            >
              {EMOJI_EXPAND}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
              }}
              title={t('inbox.closePanel')}
            >
              {EMOJI_CLOSE}
            </button>
          </div>
        </div>

        {/* Action buttons - split into two rows */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.xs,
          padding: `0 ${theme.spacing.md} ${theme.spacing.sm}`,
        }}>
          {/* Row 1: Priority emoji buttons + Archive */}
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
            {[
              { value: 1, emoji: '😌', label: 'inbox.canWait' },
              { value: 2, emoji: '😅', label: 'inbox.getOnIt' },
              { value: 3, emoji: '🙀', label: 'inbox.ohShit' },
            ].map((level) => (
              <button
                key={level.value}
                onClick={() => handleStarClick(level.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '2px 4px',
                  opacity: starCount === level.value ? 1 : INACTIVE_PRIORITY_OPACITY,
                  transition: theme.transitions.fast,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                }}
                title={t(level.label)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = starCount === level.value ? '1' : String(INACTIVE_PRIORITY_OPACITY);
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span>{level.emoji}</span>
                <span style={{
                  fontSize: '0.65rem',
                  color: theme.colors.text.tertiary,
                  whiteSpace: 'nowrap',
                }}>
                  {t(level.label)}
                </span>
              </button>
            ))}
            {/* Archive button on first row */}
            <button
              onClick={handleArchiveClick}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                marginLeft: theme.spacing.xs,
              }}
              title={t('emailDetail.archive')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{EMOJI_ARCHIVE}</span>
              <span>{t('emailDetail.archive')}</span>
            </button>
          </div>

          {/* Row 2: Reply All, Forward, Snooze */}
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            {/* Reply All button */}
            <button
              onClick={handleReplyClick}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
              title={t('emailDetail.replyAll')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{EMOJI_REPLY}</span>
              <span>{t('emailDetail.replyAll')}</span>
            </button>

            {/* Forward button */}
            <button
              onClick={handleForwardClick}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
              title={t('emailDetail.forward')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{EMOJI_FORWARD}</span>
              <span>{t('emailDetail.forward')}</span>
            </button>

            {/* Snooze button */}
            <button
              onClick={handleSnoozeClick}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: showSnoozeInput ? theme.colors.primary.light : 'transparent',
                border: `1px solid ${showSnoozeInput ? theme.colors.primary.main : theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
              title={t('emailDetail.snooze')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{EMOJI_CLOCK}</span>
              <span>{t('emailDetail.snooze')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Snooze input row - shown below header when snooze is active */}
      {showSnoozeInput && (
        <div style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          borderBottom: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.background.paper,
        }}>
          <SnoozeInputForm
            email={{ id: selectedEmailId } as Email}
            snoozeValue={snoozeValue}
            onValueChange={setSnoozeValue}
            onConfirm={handleSnoozeConfirm}
            onCancel={handleSnoozeCancel}
          />
        </div>
      )}
      
      {/* EmailDetail component */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EmailDetail ref={emailDetailComponentRef} emailId={selectedEmailId} compactMode={true} onArchiveComplete={onArchiveComplete} onSnoozeComplete={onSnoozeComplete} autoGenerateReplies={mode === MODE_ACTION} onCorrespondentChange={handleCorrespondentChange} />
      </div>
    </div>
  );
};

