import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CategoryDebugModal } from 'components/priority/CategoryDebugModal';
import { CategoryOverrideModal } from 'components/priority/CategoryOverrideModal';
import { CATEGORY_OTHER } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  emailId: string;
  onCategoryOverride?: (newCategory: string) => void;
}

interface CategoryActionButtonsProps {
  categoryExplanation?: string | null;
  showExplanation: boolean;
  onToggleExplanation: () => void;
  onOpenOverride: () => void;
  onOpenDebug: () => void;
  isAdmin: boolean;
}

const iconButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.tertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const CategoryActionButtons: React.FC<CategoryActionButtonsProps> = ({
  categoryExplanation,
  showExplanation,
  onToggleExplanation,
  onOpenOverride,
  onOpenDebug,
  isAdmin,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {categoryExplanation && (
        <button
          onClick={() => onToggleExplanation()}
          style={iconButtonStyle}
          title={t('priority.tooltip.showCategoryExplanation')}
        >
          {'ℹ️'}
        </button>
      )}
      <button onClick={onOpenOverride} style={iconButtonStyle} title={t('priority.categoryOverride.buttonTitle')}>
        {'✏️'}
      </button>
      {isAdmin && (
        <button onClick={onOpenDebug} style={iconButtonStyle} title={t('priority.categoryDebug.buttonTitle')}>
          {'👎'}
        </button>
      )}
    </>
  );
};

interface ProtoCategorySectionProps {
  protoCategoryName: string;
  protoCategoryDescription?: string | null;
}

const ProtoCategorySection: React.FC<ProtoCategorySectionProps> = ({ protoCategoryName, protoCategoryDescription }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        marginTop: theme.spacing.xs,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.xs,
        lineHeight: '1.4',
      }}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.secondary,
          marginBottom: '2px',
        }}
      >
        {t('priority.tooltip.suggestedCategory')}
      </div>
      <div style={{ color: theme.colors.text.primary }}>{protoCategoryName}</div>
      {protoCategoryDescription && (
        <div style={{ color: theme.colors.text.secondary, marginTop: '2px' }}>{protoCategoryDescription}</div>
      )}
    </div>
  );
};

export const PriorityTooltipCategory: React.FC<PriorityTooltipCategoryProps> = ({
  category,
  categoryExplanation,
  protoCategoryName,
  protoCategoryDescription,
  emailId,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showExplanation, setShowExplanation] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const isOtherCategory = !category || category === CATEGORY_OTHER;
  const isAdmin = user?.isAdmin === true;

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('priority.tooltip.category').toUpperCase()}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: theme.spacing.xs,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {isOtherCategory && protoCategoryName ? `${category} (${protoCategoryName})` : category}
        </span>
        <CategoryActionButtons
          categoryExplanation={categoryExplanation}
          showExplanation={showExplanation}
          onToggleExplanation={() => setShowExplanation(!showExplanation)}
          onOpenOverride={() => setShowOverrideModal(true)}
          onOpenDebug={() => setShowDebugModal(true)}
          isAdmin={isAdmin}
        />
      </div>
      {showExplanation && categoryExplanation && (
        <div
          style={{
            marginTop: theme.spacing.xs,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            lineHeight: '1.4',
          }}
        >
          {categoryExplanation}
        </div>
      )}
      {isOtherCategory && protoCategoryName && (
        <ProtoCategorySection
          protoCategoryName={protoCategoryName}
          protoCategoryDescription={protoCategoryDescription}
        />
      )}
      {showOverrideModal && (
        <CategoryOverrideModal
          emailId={emailId}
          currentCategory={category}
          onClose={() => setShowOverrideModal(false)}
          onSubmitted={onCategoryOverride}
        />
      )}
      {showDebugModal && <CategoryDebugModal emailId={emailId} onClose={() => setShowDebugModal(false)} />}
    </div>
  );
};
