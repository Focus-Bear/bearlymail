import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { AUTO_ARCHIVE_PROPOSALS_SETTINGS_PATH } from 'constants/autoArchive';
import { EMOJI_ARCHIVE, EMOJI_CLOSE } from 'constants/emojis';

export const AUTO_ARCHIVE_NOTICE_TEST_ID = 'auto-archive-suggestions-notice';

interface AutoArchiveSuggestionsBannerProps {
  pendingCount: number;
  onReview: () => void;
  onDismiss: () => void;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  margin: `${theme.spacing.sm} ${theme.spacing.md} 0`,
  backgroundColor: theme.colors.background.subtle,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

const reviewLinkStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  border: `1px solid ${theme.colors.border.default}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
  fontWeight: theme.typography.fontWeight.medium,
  textDecoration: 'none',
};

const dismissButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: theme.spacing.xs,
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
  lineHeight: 1,
};

/**
 * Presentational one-line inbox notice pointing at pending auto-archive
 * suggestions. Kept free of data fetching so Storybook can render it directly.
 */
export const AutoArchiveSuggestionsBanner: React.FC<AutoArchiveSuggestionsBannerProps> = ({
  pendingCount,
  onReview,
  onDismiss,
}) => {
  const { t } = useTranslation();

  return (
    <div role="status" data-testid={AUTO_ARCHIVE_NOTICE_TEST_ID} style={containerStyle}>
      <span aria-hidden="true">{EMOJI_ARCHIVE}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{t('inbox.autoArchiveNotice.message', { count: pendingCount })}</span>
      <Link to={AUTO_ARCHIVE_PROPOSALS_SETTINGS_PATH} onClick={onReview} style={reviewLinkStyle}>
        {t('inbox.autoArchiveNotice.review')}
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('inbox.autoArchiveNotice.dismiss')}
        title={t('inbox.autoArchiveNotice.dismiss')}
        style={dismissButtonStyle}
      >
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};
