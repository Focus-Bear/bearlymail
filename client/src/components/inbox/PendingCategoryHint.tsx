import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { usePrefersReducedMotion } from 'hooks/usePrefersReducedMotion';

const SPINNER_SIZE_PX = 10;

/**
 * One-line explainer under the "AI deciding category" accordion title, with a
 * small spinner (static when the user prefers reduced motion), telling the user
 * these threads are mid-categorisation rather than filed as Other.
 */
export const PendingCategoryHint: React.FC = () => {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <span
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: SPINNER_SIZE_PX,
          height: SPINNER_SIZE_PX,
          flexShrink: 0,
          borderRadius: '50%',
          border: `2px solid ${theme.colors.border.medium}`,
          borderTopColor: theme.colors.primary.main,
          animation: prefersReducedMotion ? undefined : 'spin 1s linear infinite',
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t('inbox.category.pendingCategorisationHint')}
      </span>
    </span>
  );
};
