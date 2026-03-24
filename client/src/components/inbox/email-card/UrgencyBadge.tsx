import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { URGENCY_THRESHOLD } from 'constants/numbers';

interface UrgencyBadgeProps {
  urgencyScore: number;
  urgencyExplanation?: string | null;
}

export const UrgencyBadge: React.FC<UrgencyBadgeProps> = ({ urgencyScore, urgencyExplanation }) => {
  const { t } = useTranslation();
  if (urgencyScore < URGENCY_THRESHOLD) {
    return null;
  }

  return (
    <span
      title={urgencyExplanation || t('inbox.highUrgencyEmail')}
      style={{
        fontSize: theme.typography.fontSize.sm,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: theme.colors.accent.error,
        color: theme.colors.background.paper,
        borderRadius: theme.borderRadius.full,
        fontWeight: theme.typography.fontWeight.semibold,
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        cursor: 'help',
      }}
    >
      {t('inbox.urgentBadge', { score: urgencyScore.toFixed(0) })}
    </span>
  );
};
