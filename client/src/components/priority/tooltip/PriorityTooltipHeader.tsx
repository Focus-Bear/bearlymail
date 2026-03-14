import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE } from 'constants/emojis';
import { PRIORITY_STATUS_CALCULATING, STRING_NONE } from 'constants/strings';

interface PriorityTooltipHeaderProps {
  score: number;
  breakdown?: Array<{ factor: string; value: number; description: string }>;
  onClose: () => void;
  onExpedite?: () => void;
}

export const PriorityTooltipHeader: React.FC<PriorityTooltipHeaderProps> = ({
  score,
  breakdown,
  onClose,
  onExpedite,
}) => {
  const { t } = useTranslation();

  // Calculate actual score from breakdown to ensure consistency with total score
  const calculatedScore = breakdown?.reduce((sum, item) => sum + (item.value || 0), 0) ?? score;

  // Check if still calculating (has items with "Calculating..." description)
  const isCalculating =
    breakdown?.some(
      item =>
        item.description === PRIORITY_STATUS_CALCULATING || item.description?.includes(PRIORITY_STATUS_CALCULATING)
    ) && calculatedScore === 0;

  // Use calculated score from breakdown if available, otherwise fall back to stored score
  const displayScore = breakdown && breakdown.length > 0 ? calculatedScore : score;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        paddingBottom: theme.spacing.sm,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          cursor: isCalculating && onExpedite ? 'pointer' : 'default',
          textDecoration: isCalculating && onExpedite ? 'underline' : 'none',
        }}
        onClick={isCalculating && onExpedite ? onExpedite : undefined}
        title={isCalculating && onExpedite ? 'Click to expedite calculation' : undefined}
      >
        {isCalculating ? t('email.calculating') : t('emailDetail.priorityScore', { score: displayScore.toFixed(0) })}
      </h3>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: STRING_NONE,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xl,
          color: theme.colors.text.tertiary,
          padding: 0,
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={t('common.close')}
      >
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};
