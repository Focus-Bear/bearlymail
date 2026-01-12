import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { QuickActionsSection } from 'components/email-detail/QuickActionsSection';
import { EMOJI_REPLY, EMOJI_ARCHIVE, EMOJI_BLOCK, EMOJI_LINK, EMOJI_DELETE, EMOJI_STAR } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { REPLY_MODE_REPLY } from 'constants/strings';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { captureEvent } from 'utils/posthog';

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
  onOpenReplyComposer: (mode: 'reply' | 'replyAll') => void;
  onArchive: () => void;
  onDelete: () => void;
  onSetStarCount: (emailId: string, starCount: number) => Promise<void>;
  onBlockSender: (emailId: string) => void;
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
}) => {
  const { t } = useTranslation();
  
  const emailWithStarCount = email as any;
  const starCount = emailWithStarCount?.starCount ?? 0;

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

      {/* All Actions in Single Row */}
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
            onClick={onArchive}
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

          <button
            onClick={onDelete}
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
            <span>{EMOJI_DELETE}</span>
            {t('emailDetail.delete') || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};
