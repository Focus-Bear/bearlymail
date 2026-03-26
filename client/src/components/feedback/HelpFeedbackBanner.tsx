import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FeedbackButton } from './FeedbackButton';

/**
 * Banner displayed at the top of help pages (index and individual articles).
 * Wraps FeedbackButton with a heading and description so users can quickly
 * send feedback without having to scroll to the bottom of the page.
 */
export const HelpFeedbackBanner: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginBottom: theme.spacing.xl,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.lg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
      }}
    >
      <div>
        <h2
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.xl,
            marginBottom: theme.spacing.xs,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('contactFeedback.title')}
        </h2>
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.base, margin: 0 }}>
          {t('contactFeedback.description')}
        </p>
      </div>
      <FeedbackButton />
    </div>
  );
};
