import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PriorityTooltipBreakdownTotal } from 'components/priority/tooltip/PriorityTooltipBreakdownTotal';

interface PriorityTooltipBreakdownProps {
  breakdown: Array<{ factor: string; value: number; description: string }>;
  onExpedite?: () => void;
}

export const PriorityTooltipBreakdown: React.FC<PriorityTooltipBreakdownProps> = ({ breakdown, onExpedite }) => {
  const { t } = useTranslation();
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('emailDetail.scoreBreakdown').toUpperCase()}
      </div>
      {breakdown.map(item => (
        <div
          key={item.factor || `breakdown-${item.value}`}
          style={{
            marginBottom: theme.spacing.xs || '4px',
            padding: theme.spacing.xs || '4px',
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.sm,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '1px',
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginRight: theme.spacing.xs || '4px',
              }}
            >
              {item.factor}
            </span>
            <span
              style={{
                fontWeight: 'bold',
                color: item.value >= 0 ? theme.colors.accent.success : theme.colors.accent.error,
                flexShrink: 0,
              }}
            >
              {item.value >= 0 ? '+' : ''}
              {item.value.toFixed(0)}
            </span>
          </div>
          {item.description && (
            <div
              style={{
                fontSize: '0.65rem',
                color: theme.colors.text.secondary,
                marginTop: '1px',
                lineHeight: '1.2',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {item.description}
            </div>
          )}
        </div>
      ))}
      <PriorityTooltipBreakdownTotal breakdown={breakdown} onExpedite={onExpedite} />
    </div>
  );
};
