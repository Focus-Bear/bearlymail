import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { CategoryOverrideModal } from 'components/priority/CategoryOverrideModal';
import { CATEGORY_OTHER } from 'constants/strings';

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  emailId: string;
  onCategoryOverride?: (newCategory: string) => void;
}

export const PriorityTooltipCategory: React.FC<PriorityTooltipCategoryProps> = ({
  category,
  categoryExplanation,
  protoCategoryName,
  protoCategoryDescription,
  emailId,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();
  const [showExplanation, setShowExplanation] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const isOtherCategory = category === CATEGORY_OTHER;

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
          {isOtherCategory && protoCategoryName
            ? `${category} (${protoCategoryName})`
            : category}
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
        <button
          onClick={() => setShowOverrideModal(true)}
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
          title={t('priority.categoryOverride.buttonTitle')}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {'✏️'}
        </button>
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
      {isOtherCategory && protoCategoryName && (
        <div style={{
          marginTop: theme.spacing.xs,
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          lineHeight: '1.4',
        }}>
          <div style={{
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.secondary,
            marginBottom: '2px',
          }}>
            {t('priority.tooltip.suggestedCategory')}
          </div>
          <div style={{ color: theme.colors.text.primary }}>
            {protoCategoryName}
          </div>
          {protoCategoryDescription && (
            <div style={{
              color: theme.colors.text.secondary,
              marginTop: '2px',
            }}>
              {protoCategoryDescription}
            </div>
          )}
        </div>
      )}
      {showOverrideModal && (
        <CategoryOverrideModal
          emailId={emailId}
          currentCategory={category}
          onClose={() => setShowOverrideModal(false)}
          onSubmitted={onCategoryOverride}
        />
      )}
    </div>
  );
};
