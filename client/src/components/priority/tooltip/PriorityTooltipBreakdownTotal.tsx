import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PRIORITY_STATUS_CALCULATING } from 'constants/strings';

interface PriorityTooltipBreakdownTotalProps {
  breakdown: Array<{ factor?: string; value: number; description?: string }>;
  onExpedite?: () => void;
}

export const PriorityTooltipBreakdownTotal: React.FC<PriorityTooltipBreakdownTotalProps> = ({
  breakdown,
  onExpedite,
}) => {
  const { t } = useTranslation();
  const breakdownTotal = breakdown.reduce((sum, item) => sum + (item.value || 0), 0);

  // Check if still calculating (has items with "Calculating..." description and total is 0)
  const isCalculating =
    breakdown.some(
      item =>
        item.description === PRIORITY_STATUS_CALCULATING || item.description?.includes(PRIORITY_STATUS_CALCULATING)
    ) && breakdownTotal === 0;

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.primary.subtle,
        borderRadius: theme.borderRadius.sm,
        borderTop: `2px solid ${theme.colors.border.medium}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>{t('emailDetail.totalScore')}:</span>
        <span
          style={{
            color: (() => {
              if (isCalculating) {
                return theme.colors.text.secondary;
              }
              return breakdownTotal >= 0 ? theme.colors.accent.success : theme.colors.accent.error;
            })(),
            cursor: isCalculating && onExpedite ? 'pointer' : 'default',
            textDecoration: isCalculating && onExpedite ? 'underline' : 'none',
          }}
          onClick={isCalculating && onExpedite ? onExpedite : undefined}
          title={isCalculating && onExpedite ? 'Click to expedite calculation' : undefined}
        >
          {isCalculating ? t('email.calculating') : `${breakdownTotal >= 0 ? '+' : ''}${breakdownTotal.toFixed(0)}`}
        </span>
      </div>
    </div>
  );
};
