import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE } from 'constants/emojis';

interface QuickActionsHeaderProps {
  onClose: () => void;
}

export const QuickActionsHeader: React.FC<QuickActionsHeaderProps> = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}
    >
      <h2
        style={{
          margin: 0,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        {t('quickActions.title')}
      </h2>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xl,
          padding: theme.spacing.xs,
        }}
      >
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};
