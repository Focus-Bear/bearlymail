import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
}

export const PriorityTooltipCategory: React.FC<PriorityTooltipCategoryProps> = ({
  category,
  categoryExplanation,
}) => {
  const { t } = useTranslation();
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      <div style={{
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.xs,
      }}>
        {t('priority.tooltip.category').toUpperCase()}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.xs,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.sm,
      }}>
        <span style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}>
          {category}
        </span>
        {categoryExplanation && (
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.tertiary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('priority.tooltip.showCategoryExplanation')}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            {'ℹ️'}
          </button>
        )}
      </div>
      {showExplanation && categoryExplanation && (
        <div style={{
          marginTop: theme.spacing.xs,
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          lineHeight: '1.4',
        }}>
          {categoryExplanation}
        </div>
      )}
    </div>
  );
};
