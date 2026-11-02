import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FiEdit2, FiRefreshCw } from 'react-icons/fi';
import { useHref } from 'react-router-dom';
import { theme } from 'theme/theme';
import { AiDecisionProvider, CategorizationSource } from 'types/email';
import { categoryRuleSettingsPath, extractMatchedRuleId } from 'utils/categoryRuleLinks';

import { CategoryDebugModal } from 'components/priority/CategoryDebugModal';
import { CategoryOverrideModal } from 'components/priority/CategoryOverrideModal';
import { getCategorisationSourceLabelKey } from 'components/priority/tooltip/decisionSourceLabels';
import { CATEGORY_OTHER } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

/** The provenance kind whose "Categorised by" label links to the matched rule. */
const RULE_CATEGORISATION_SOURCE: CategorizationSource = 'rule';

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
  /** Which process assigned this category — rendered as a "Categorised by" line. */
  categorizationSource?: CategorizationSource | null;
  /** AI engine behind an 'ai' source, so the line names it (e.g. "LLM (Gemini)"). */
  categorizationProvider?: AiDecisionProvider | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  emailId: string;
  /** UUID of the email's current category — passed to CategoryOverrideModal for correct optimistic update. */
  currentCategoryId?: string | null;
  onCategoryOverride?: (newCategory: string) => void;
}

interface CategoryActionButtonsProps {
  categoryExplanation?: string | null;
  showExplanation: boolean;
  onToggleExplanation: () => void;
  onOpenOverride: () => void;
  onOpenDebug: () => void;
  isAdmin: boolean;
  /** Settings deep-link to the matched rule; present only for deterministic-rule matches. */
  editRuleHref: string | null;
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

const explanationBoxStyle: React.CSSProperties = {
  marginTop: theme.spacing.xs,
  padding: theme.spacing.sm,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.secondary,
  lineHeight: '1.4',
};

const sourceLinkStyle: React.CSSProperties = {
  color: theme.colors.primary.main,
  textDecoration: 'underline',
  cursor: 'pointer',
};

/**
 * Category edit control. Rendered as a labelled, bordered button pushed to the
 * far right of the category row so it's clearly discoverable as an actionable
 * control (issue: the bare pencil icon was too subtle to notice).
 */
const editButtonStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 10px',
  border: `1px solid ${theme.colors.primary.main}`,
  borderRadius: theme.borderRadius.sm,
  background: theme.colors.background.paper,
  color: theme.colors.primary.main,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/**
 * Opens the matched-rule deep-link in a new tab so the user keeps their place
 * in the inbox (issue #2057). Shared by the ⚙️ button and the "Categorised by"
 * link.
 */
function openEditRuleInNewTab(editRuleHref: string): void {
  window.open(editRuleHref, '_blank', 'noopener,noreferrer');
}

const CategoryActionButtons: React.FC<CategoryActionButtonsProps> = ({
  categoryExplanation,
  showExplanation,
  onToggleExplanation,
  onOpenOverride,
  onOpenDebug,
  isAdmin,
  editRuleHref,
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
      {editRuleHref && (
        <button
          onClick={() => openEditRuleInNewTab(editRuleHref)}
          style={iconButtonStyle}
          title={t('priority.tooltip.editCategoryRule')}
          aria-label={t('priority.tooltip.editCategoryRule')}
          data-testid="edit-category-rule-btn"
        >
          {'⚙️'}
        </button>
      )}
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
      <button
        onClick={onOpenOverride}
        style={editButtonStyle}
        title={t('priority.categoryOverride.buttonTitle')}
        aria-label={t('priority.categoryOverride.buttonTitle')}
        data-testid="edit-category-btn"
        type="button"
      >
        <FiEdit2 size={12} aria-hidden />
        {t('priority.categoryOverride.editButton')}
      </button>
    </>
  );
};

interface CategorisationSourceLineProps {
  source: CategorizationSource;
  provider?: AiDecisionProvider | null;
  /**
   * Settings deep-link for a rule-decided category: the matched rule, or the
   * rules list when the thread never recorded which rule matched. Null for
   * other sources, whose label stays plain text.
   */
  ruleHref: string | null;
  ruleLinkTitle: string;
}

const CategorisationSourceLine: React.FC<CategorisationSourceLineProps> = ({
  source,
  provider,
  ruleHref,
  ruleLinkTitle,
}) => {
  const { t } = useTranslation();
  const sourceLabel = t(getCategorisationSourceLabelKey(source, provider));

  const sourceNode = ruleHref ? (
    <a
      href={ruleHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={event => {
        // Keep the user's place in the inbox — open the rule in a new tab
        // (issue #2057) rather than navigating this view away.
        event.preventDefault();
        openEditRuleInNewTab(ruleHref);
      }}
      style={sourceLinkStyle}
      title={ruleLinkTitle}
      data-testid="categorised-by-rule-link"
    />
  ) : (
    <span />
  );

  return (
    <div
      style={{
        marginTop: theme.spacing.xs,
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
      }}
    >
      <Trans
        i18nKey="priority.tooltip.categorisedBy.label"
        values={{ sourceLabel }}
        // `ruleLink` (not a real HTML element) — Trans self-closes HTML void
        // tags like <source>, which would drop the wrapped label text.
        components={{ ruleLink: sourceNode }}
      />
    </div>
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
  categorizationSource,
  categorizationProvider,
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

  const matchedRuleId = extractMatchedRuleId(categoryExplanation);
  // useHref applies the router's basename so the URL is correct if the app is
  // ever mounted under a subpath (e.g. `/app/`). Hooks must run unconditionally.
  const ruleSettingsHref = useHref(categoryRuleSettingsPath(matchedRuleId));
  // The ⚙️ button edits the exact rule, so it needs the recorded rule ID.
  const actionRuleHref = matchedRuleId ? ruleSettingsHref : null;
  // Threads filed before the rule ID was recorded link to the rules list
  // instead: guessing the rule from the category name could open the wrong one.
  const sourceRuleHref = categorizationSource === RULE_CATEGORISATION_SOURCE ? ruleSettingsHref : null;
  const sourceRuleLinkTitle = matchedRuleId
    ? t('priority.tooltip.editCategoryRule')
    : t('priority.tooltip.openCategoryRulesList');

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
          editRuleHref={actionRuleHref}
        />
      </div>
      {categorizationSource && (
        <CategorisationSourceLine
          source={categorizationSource}
          provider={categorizationProvider}
          ruleHref={sourceRuleHref}
          ruleLinkTitle={sourceRuleLinkTitle}
        />
      )}
      {showExplanation && categoryExplanation && <div style={explanationBoxStyle}>{categoryExplanation}</div>}
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
