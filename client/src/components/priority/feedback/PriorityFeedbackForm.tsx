import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface PriorityFeedbackFormProps {
  feedback: string;
  expectedPriority: number | undefined;
  currentPriorityScore: number;
  onFeedbackChange: (value: string) => void;
  onExpectedPriorityChange: (value: number | undefined) => void;
}

export const PriorityFeedbackForm: React.FC<PriorityFeedbackFormProps> = ({
  feedback,
  expectedPriority,
  currentPriorityScore,
  onFeedbackChange,
  onExpectedPriorityChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
        {t('priority.feedback.currentScore', { score: currentPriorityScore.toFixed(0) })}.
        {t('priority.feedback.pleaseExplain')}
      </p>

      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            display: 'block',
            marginBottom: theme.spacing.xs || '4px',
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('priority.feedback.feedbackLabel')}:
        </label>
        <textarea
          value={feedback}
          onChange={event => onFeedbackChange(event.target.value)}
          placeholder={t('priority.feedback.feedbackPlaceholder')}
          style={{
            width: '100%',
            minHeight: '120px',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.sm,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            display: 'block',
            marginBottom: theme.spacing.xs || '4px',
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('priority.feedback.expectedScoreLabel')}:
        </label>
        <input
          type="number"
          min="0"
          max="100"
          value={expectedPriority || ''}
          onChange={event => onExpectedPriorityChange(event.target.value ? Number(event.target.value) : undefined)}
          placeholder="0-100"
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
      </div>
    </>
  );
};
