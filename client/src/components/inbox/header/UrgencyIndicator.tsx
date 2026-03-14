import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_SIREN } from 'constants/emojis';
import { URGENCY_THRESHOLD } from 'constants/numbers';

interface UrgencyIndicatorProps {
  urgencyScore: number | undefined;
  urgencyExplanation?: string | null;
}

export const UrgencyIndicator: React.FC<UrgencyIndicatorProps> = ({ urgencyScore, urgencyExplanation }) => {
  const { t } = useTranslation();
  if (urgencyScore === undefined || urgencyScore < URGENCY_THRESHOLD) {
    return null;
  }

  return (
    <span
      title={urgencyExplanation || t('inbox.highUrgencyEmail')}
      style={{
        fontSize: theme.typography.fontSize.xs,
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
      {EMOJI_SIREN} {t('inbox.urgent')} ({urgencyScore.toFixed(0)})
    </span>
  );
};
