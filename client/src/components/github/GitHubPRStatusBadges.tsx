import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_CHECK, EMOJI_WARNING, EMOJI_COMMENT } from 'constants/emojis';
import { GITHUB_REVIEW_STATUS_APPROVED, GITHUB_REVIEW_STATUS_CHANGES_REQUESTED } from 'constants/strings';

interface GitHubPRStatusBadgesProps {
  reviewStatus?: 'approved' | 'changes_requested' | 'pending' | null;
  commentsCount?: number;
  mergeable?: boolean | null;
}

export const GitHubPRStatusBadges: React.FC<GitHubPRStatusBadgesProps> = ({
  reviewStatus,
  commentsCount,
  mergeable,
}) => {
  const { t } = useTranslation();
  
  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      {reviewStatus === GITHUB_REVIEW_STATUS_APPROVED && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: `${theme.colors.accent.success}20`,
          color: theme.colors.accent.success,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
          marginRight: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_CHECK} {t('github.approved')}
        </div>
      )}
      {reviewStatus === GITHUB_REVIEW_STATUS_CHANGES_REQUESTED && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: `${theme.colors.accent.warning}20`,
          color: theme.colors.accent.warning,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
          marginRight: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_WARNING} {t('github.changesRequested')}
        </div>
      )}
      {commentsCount !== undefined && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.secondary,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          marginRight: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_COMMENT} {t('github.comments', { count: commentsCount })}
        </div>
      )}
      {mergeable !== null && mergeable && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: `${theme.colors.accent.success}20`,
          color: theme.colors.accent.success,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_CHECK} {t('github.readyToMerge')}
        </div>
      )}
    </div>
  );
};



