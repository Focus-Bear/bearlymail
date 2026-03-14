import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_LIGHTNING } from 'constants/emojis';
import { STRING_NONE } from 'constants/strings';

interface QuickActionsButtonProps {
  actionCount: number;
  onClick: () => void;
}

export const QuickActionsButton: React.FC<QuickActionsButtonProps> = ({ actionCount, onClick }) => {
  const { t } = useTranslation();
  if (actionCount === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        position: 'relative',
      }}
      title={t('quickActions.title')}
    >
      <span>{EMOJI_LIGHTNING}</span>
      {t('quickActions.title')}
      {actionCount > 0 && (
        <span
          style={{
            backgroundColor: COLOR_NAMED_WHITE,
            color: theme.colors.primary.main,
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.bold,
            marginLeft: theme.spacing.xs,
          }}
        >
          {actionCount}
        </span>
      )}
    </button>
  );
};
