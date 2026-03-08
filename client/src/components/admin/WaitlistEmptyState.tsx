import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface WaitlistEmptyStateProps {
  messageKey: string;
}

export const WaitlistEmptyState: React.FC<WaitlistEmptyStateProps> = ({ messageKey }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        textAlign: 'center',
        color: theme.colors.text.secondary,
      }}
    >
      {t(messageKey)}
    </div>
  );
};
