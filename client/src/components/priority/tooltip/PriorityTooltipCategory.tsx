import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { useHref } from 'react-router-dom';
import { theme } from 'theme/theme';
import { CategorizationSource } from 'types/email';

import { CategoryDebugModal } from 'components/priority/CategoryDebugModal';
import { CategoryOverrideModal } from 'components/priority/CategoryOverrideModal';
import { EDIT_RULE_CATEGORY_PARAM, EDIT_RULE_ID_PARAM, GUIDE_OUR_AI_ANCHOR } from 'constants/category-rules';
import { CATEGORY_OTHER } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const DETERMINISTIC_RULE_PREFIX = 'Matched deterministic rule';

/** The provenance kind whose "Categorised by" label links to the matched rule. */
const RULE_CATEGORISATION_SOURCE: CategorizationSource = 'rule';

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

/**
 * Builds the Settings deep-link query that opens the matched deterministic rule.
 * Prefers the rule ID (opens the SPECIFIC rule that fired) and falls back to
 * the category name for older `categoryExplanation` values without the marker.
 */
function buildEditRuleQuery(category: string, matchedRuleId: string | null): string {
  return matchedRuleId
    ? `${EDIT_RULE_ID_PARAM}=${matchedRuleId}`
    : `${EDIT_RULE_CATEGORY_PARAM}=${encodeURIComponent(category)}`;
}

/** i18n key (under `priority.tooltip.categorisedBy`) for each provenance kind. */
const CATEGORISATION_SOURCE_LABEL_KEYS: Record<CategorizationSource, string> = {
  ai: 'priority.tooltip.categorisedBy.ai',
  rule: 'priority.tooltip.categorisedBy.rule',
  local: 'priority.tooltip.categorisedBy.local',
  proto: 'priority.tooltip.categorisedBy.proto',
  user: 'priority.tooltip.categorisedBy.user',
};

interface PriorityTooltipCategoryProps {
  category: string;
  categoryExplanation?: string | null;
  /** Which process assigned this category — rendered as a "Categorised by" line. */
  categorizationSource?: CategorizationSource | null;
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

const sourceLinkStyle: React.CSSProperties = {
  color: theme.colors.primary.main,
  textDecoration: 'underline',
  cursor: 'pointer',
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

interface CategorisationSourceLineProps {
  source: CategorizationSource;
  /**
   * Settings deep-link to the matched rule. When present (deterministic-rule
   * source), the "Deterministic rule" label becomes a link; otherwise the
   * label stays plain text.
   */
  ruleHref: string | null;
}

const CategorisationSourceLine: React.FC<CategorisationSourceLineProps> = ({ source, ruleHref }) => {
  const { t } = useTranslation();
  const sourceLabel = t(CATEGORISATION_SOURCE_LABEL_KEYS[source]);

  const sourceNode =
    source === RULE_CATEGORISATION_SOURCE && ruleHref ? (
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
        title={t('priority.tooltip.editCategoryRule')}
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
  const isDeterministicRuleMatch = categoryExplanation?.startsWith(DETERMINISTIC_RULE_PREFIX) ?? false;
  // useHref applies the router's basename so the URL is correct if the app is
  // ever mounted under a subpath (e.g. `/app/`). Hooks must run unconditionally.
  const editRuleHref = useHref(`/settings?${buildEditRuleQuery(category, matchedRuleId)}#${GUIDE_OUR_AI_ANCHOR}`);
  // The ⚙️ button appears for explicit deterministic-rule explanations.
  const actionRuleHref = isDeterministicRuleMatch ? editRuleHref : null;
  // The "Categorised by: Deterministic rule" link appears only when the source
  // is a rule AND the rule is resolvable (explicit rule ID, or a concrete
  // category name to match against — never "Other").
  const canResolveRule = !!matchedRuleId || !isOtherCategory;
  const sourceRuleHref = categorizationSource === RULE_CATEGORISATION_SOURCE && canResolveRule ? editRuleHref : null;

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
      {categorizationSource && <CategorisationSourceLine source={categorizationSource} ruleHref={sourceRuleHref} />}
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
