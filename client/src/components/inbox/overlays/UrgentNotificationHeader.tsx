import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_SIREN } from 'constants/emojis';

interface UrgentNotificationHeaderProps {
  count: number;
}

export const UrgentNotificationHeader: React.FC<UrgentNotificationHeaderProps> = ({ count }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>{EMOJI_SIREN}</span>
      <h3
        style={{
          color: theme.colors.accent.error,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        {t('inbox.urgentEmailsFound', { count })}
      </h3>
    </div>
  );
};
