import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface StarDiscrepancyActionsProps {
  explanation: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export const StarDiscrepancyActions: React.FC<StarDiscrepancyActionsProps> = ({
  explanation,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const hasExplanation = explanation.trim();
  const isDisabled = !hasExplanation || submitting;

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('priority.star.skip')}
      </button>
      <button
        onClick={onSubmit}
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: hasExplanation && !submitting ? theme.colors.primary.main : theme.colors.background.subtle,
          color: hasExplanation && !submitting ? 'white' : theme.colors.text.tertiary,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {submitting ? t('priority.star.submitting') : t('priority.star.submit')}
      </button>
    </div>
  );
};
