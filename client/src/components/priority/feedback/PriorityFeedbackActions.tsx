import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface PriorityFeedbackActionsProps {
  submitting: boolean;
  hasFeedback: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export const PriorityFeedbackActions: React.FC<PriorityFeedbackActionsProps> = ({
  submitting,
  hasFeedback,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const isDisabled = submitting || !hasFeedback;

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={onSubmit}
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: isDisabled ? theme.colors.background.subtle : theme.colors.primary.main,
          color: theme.colors.background.paper,
          border: 'none',
          borderRadius: theme.borderRadius.sm,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {submitting ? t('priority.feedback.submitting') : t('priority.feedback.submit')}
      </button>
    </div>
  );
};
