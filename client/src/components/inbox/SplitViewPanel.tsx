import React, { RefObject, useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import EmailDetail, { EmailDetailRef } from 'pages/EmailDetail';
import { EMOJI_CLOSE, EMOJI_EXPAND, EMOJI_REPLY, EMOJI_ARCHIVE, EMOJI_STAR } from 'constants/emojis';
import { InboxMode } from 'types/email';
import { MODE_ACTION } from 'constants/strings';

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
  onArchiveComplete?: () => void;
  onSnoozeComplete?: () => void;
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
  mode,
}) => {
  const { t } = useTranslation();
  const emailDetailComponentRef = useRef<EmailDetailRef>(null);
  const [starCount, setStarCount] = useState<number>((selectedEmail as any)?.starCount ?? 0);
  const [correspondentName, setCorrespondentName] = useState<string>('');
  
  const senderName = correspondentName || selectedEmail?.fromName || selectedEmail?.from || '';
  const subject = selectedEmail?.subject || t('inbox.emailDetails');

  const handleCorrespondentChange = useCallback((correspondent: { name: string; email: string }) => {
    setCorrespondentName(correspondent.name);
  }, []);

  // Sync starCount and reset correspondent when selectedEmail changes
  useEffect(() => {
    setStarCount((selectedEmail as any)?.starCount ?? 0);
    setCorrespondentName('');
  }, [selectedEmail]);

  const handleReplyClick = () => {
    emailDetailComponentRef.current?.openReplyComposer();
  };

  const handleArchiveClick = () => {
    emailDetailComponentRef.current?.archive();
  };

  const handleStarClick = (count: number) => {
    const newCount = starCount === count ? 0 : count;
    setStarCount(newCount);
    emailDetailComponentRef.current?.setStarCount(newCount);
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
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
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

        {/* Action buttons - always visible in header */}
        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexShrink: 0 }}>
          {/* Star buttons */}
          <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                onClick={() => handleStarClick(count)}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: starCount === count ? theme.colors.primary.main : 'transparent',
                  color: starCount === count ? 'white' : theme.colors.text.secondary,
                  border: `1px solid ${starCount === count ? theme.colors.primary.main : theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.xs,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={t('inbox.prioritise')}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                {EMOJI_STAR}
              </button>
            ))}
          </div>

          {/* Reply button */}
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
            title={t('emailDetail.reply')}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span>{EMOJI_REPLY}</span>
            <span>{t('emailDetail.reply')}</span>
          </button>

          {/* Archive button */}
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
            }}
            title={t('emailDetail.archive')}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span>{EMOJI_ARCHIVE}</span>
            <span>{t('emailDetail.archive')}</span>
          </button>
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
      
      {/* EmailDetail component */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EmailDetail ref={emailDetailComponentRef} emailId={selectedEmailId} compactMode={true} onArchiveComplete={onArchiveComplete} onSnoozeComplete={onSnoozeComplete} autoGenerateReplies={mode === MODE_ACTION} onCorrespondentChange={handleCorrespondentChange} />
      </div>
    </div>
  );
};

