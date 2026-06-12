import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { usePriorityCalculatedFlash } from 'hooks/usePriorityCalculatedFlash';

interface PriorityBadgeProps {
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  priorityScore: number;
  isProcessingPriority: boolean;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priorityLabel,
  priorityColor,
  priorityBg,
  priorityScore,
  isProcessingPriority,
}) => {
  const { t } = useTranslation();
  // Briefly show a ✅ confirmation when the spinner resolves while the badge is mounted,
  // instead of jumping straight from "Calculating..." to the label.
  const showCalculated = usePriorityCalculatedFlash(isProcessingPriority);

  return (
    <span
      style={{
        fontSize: theme.typography.fontSize.sm,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: priorityBg,
        color: priorityColor,
        borderRadius: theme.borderRadius.full,
        fontWeight: theme.typography.fontWeight.medium,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        cursor: 'help',
        lineHeight: '1.2',
        whiteSpace: 'nowrap',
      }}
    >
      {isProcessingPriority ? (
        <>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              border: `2px solid ${priorityColor}`,
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          {t('email.calculating')}
        </>
      ) : (
        <>
          {showCalculated && (
            <span role="img" aria-label={t('email.priorityCalculated')} title={t('email.priorityCalculated')}>
              ✅
            </span>
          )}
          {`${priorityLabel} (${priorityScore.toFixed(0)})`}
        </>
      )}
    </span>
  );
};
