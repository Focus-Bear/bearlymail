import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { useHref } from 'react-router-dom';
import { theme } from 'theme/theme';

import { CategoryDebugModal } from 'components/priority/CategoryDebugModal';
import { CategoryOverrideModal } from 'components/priority/CategoryOverrideModal';
import { CATEGORY_OTHER } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const DETERMINISTIC_RULE_PREFIX = 'Matched deterministic rule';

/**
 * Issue #1789: the backend appends `(rule:<uuid>)` to `categoryExplanation`
 * for deterministic-rule matches so the tooltip can navigate to the SPECIFIC
 * matched rule (multiple rules can share a category).
 */
const RULE_ID_MARKER_RE = /\(rule:([0-9a-f-]+)\)\s*$/i;

function extractMatchedRuleId(explanation: string | null | undefined): string | null {
  if (!explanation) {
    return null;
  }
  const match = RULE_ID_MARKER_RE.exec(explanation);
  return match ? match[1] : null;
}

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  emailId: string;
  /** UUID of the email's current category — passed to CategoryOverrideModal for correct optimistic update. */
  currentCategoryId?: string | null;
  onCategoryOverride?: (newCategory: string) => void;
}

interface CategoryActionButtonsProps {
  categoryExplanation?: string | null;
  category: string;
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
  category,
  showExplanation,
  onToggleExplanation,
  onOpenOverride,
  onOpenDebug,
  isAdmin,
}) => {
  const { t } = useTranslation();
  const isDeterministicRuleMatch = categoryExplanation?.startsWith(DETERMINISTIC_RULE_PREFIX) ?? false;
  const matchedRuleId = extractMatchedRuleId(categoryExplanation);
  // Issue #1789: prefer the matched rule's ID so we open the SPECIFIC rule
  // that fired (multiple rules can share a category). Fall back to the
  // category name for older `categoryExplanation` values without the marker.
  const editRuleQuery = matchedRuleId
    ? `openEditRuleId=${matchedRuleId}`
    : `openEditRule=${encodeURIComponent(category)}`;
  // useHref applies the router's basename so the URL is correct if the app
  // is ever mounted under a subpath (e.g. `/app/`).
  const editRuleHref = useHref(`/settings?${editRuleQuery}#guide-our-ai`);

  const handleEditRule = () => {
    // Issue #2057: open in a new tab so the user doesn't lose their place.
    window.open(editRuleHref, '_blank', 'noopener,noreferrer');
  };

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
      {isDeterministicRuleMatch && (
        <button
          onClick={handleEditRule}
          style={iconButtonStyle}
          title={t('priority.tooltip.editCategoryRule')}
          aria-label={t('priority.tooltip.editCategoryRule')}
          data-testid="edit-category-rule-btn"
        >
          {'⚙️'}
        </button>
      )}
      <button onClick={onOpenOverride} style={iconButtonStyle} title={t('priority.categoryOverride.buttonTitle')}>
        {'✏️'}
      </button>
      {isAdmin && (
        <button
          onClick={onOpenDebug}
          style={iconButtonStyle}
          title={t('priority.categoryDebug.buttonTitle')}
          aria-label={t('priority.categoryDebug.buttonTitle')}
          type="button"
        >
          <FiRefreshCw size={14} aria-hidden />
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
  currentCategoryId,
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
          category={category}
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
          currentCategoryId={currentCategoryId}
          onClose={() => setShowOverrideModal(false)}
          onSubmitted={onCategoryOverride}
        />
      )}
      {showDebugModal && <CategoryDebugModal emailId={emailId} onClose={() => setShowDebugModal(false)} />}
    </div>
  );
};
