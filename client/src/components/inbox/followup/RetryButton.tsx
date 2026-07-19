import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

interface RetryButtonProps {
  onRetry: () => void;
}

export const RetryButton: React.FC<RetryButtonProps> = ({ onRetry }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onRetry}
      style={{
        marginTop: theme.spacing.sm,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: COLOR_TRANSPARENT,
        color: theme.colors.error.main,
        border: `1px solid ${theme.colors.error.main}`,
        borderRadius: theme.borderRadius.sm,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      {t('common.retry')}
    </button>
  );
};
