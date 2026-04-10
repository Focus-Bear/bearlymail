import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { CategoryRuleDto } from 'types/category-rules.types';
import { specSenders, specSubjects } from 'types/category-rules.types';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

const weakRuleBadgeStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.warning.light,
  border: `1px solid ${theme.colors.accent.warning}`,
  color: theme.colors.text.secondary,
};

const legacyWeakRuleBannerStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.secondary,
  marginTop: theme.spacing.xs,
  backgroundColor: theme.colors.warning.light,
  borderRadius: theme.borderRadius.sm,
  padding: theme.spacing.xs,
};

const rowStyle: React.CSSProperties = {
  padding: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.light}`,
  fontSize: theme.typography.fontSize.sm,
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: theme.typography.fontSize.xs,
  wordBreak: 'break-word',
};

const btnStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  background: theme.colors.background.paper,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
};

const kindPillStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
};

const labelRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  marginLeft: 'auto',
  fontSize: theme.typography.fontSize.xs,
};

interface CategoryRuleRowHeaderProps {
  rule: CategoryRuleDto;
  isComposite: boolean;
  isLegacy: boolean;
  kindLabel: string;
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDelete: (id: string) => void;
  onEditComposite?: (rule: CategoryRuleDto) => void;
  onUpgradeToComposite?: (rule: CategoryRuleDto) => void;
}

const CategoryRuleRowHeader: React.FC<CategoryRuleRowHeaderProps> = ({
  rule,
  isComposite,
  isLegacy,
  kindLabel,
  onToggleEnabled,
  onDelete,
  onEditComposite,
  onUpgradeToComposite,
}) => {
  const { t } = useTranslation();
  return (
    <div style={headerRowStyle}>
      <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{rule.categoryName}</span>
      <span style={kindPillStyle}>{kindLabel}</span>
      {isLegacy ? (
        <span style={weakRuleBadgeStyle} title={t('settings.deterministicCategoryRules.legacyWeakWarning')}>
          {t('settings.deterministicCategoryRules.kindLegacyWeak')}
        </span>
      ) : null}
      {!rule.isEnabled ? (
        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
          ({t('settings.deterministicCategoryRules.disabled')})
        </span>
      ) : null}
      <label style={labelRowStyle}>
        <input
          type="checkbox"
          checked={rule.isEnabled}
          onChange={(event) => onToggleEnabled(rule.id, event.target.checked)}
        />
        {t('settings.deterministicCategoryRules.enabledToggle')}
      </label>
      {isComposite && onEditComposite ? (
        <button type="button" style={btnStyle} onClick={() => onEditComposite(rule)}>
          {t('common.edit')}
        </button>
      ) : null}
      {isLegacy && onUpgradeToComposite ? (
        <button type="button" style={btnStyle} onClick={() => onUpgradeToComposite(rule)}>
          {t('settings.deterministicCategoryRules.upgradeToComposite')}
        </button>
      ) : null}
      <button type="button" style={btnStyle} onClick={() => onDelete(rule.id)}>
        {t('common.delete')}
      </button>
    </div>
  );
};

const CategoryRuleRowSpecBody: React.FC<{ rule: CategoryRuleDto }> = ({ rule }) => {
  const { t } = useTranslation();
  const isComposite = rule.ruleKind === CATEGORY_RULE_KIND_COMPOSITE;
  if (isComposite) {
    if (!rule.compositeSpec) {
      return null;
    }
    const senders = specSenders(rule.compositeSpec);
    const subjects = specSubjects(rule.compositeSpec);
    const separator = t('settings.deterministicCategoryRules.bodyPhraseSeparator');
    return (
      <>
        <div style={mono}>
          {t('settings.deterministicCategoryRules.senderField')}: {senders.join(separator)}
        </div>
        <div style={mono}>
          {t('settings.deterministicCategoryRules.subjectContainsField')}: {subjects.join(separator)}
        </div>
        <div style={mono}>
          {t('settings.deterministicCategoryRules.bodyPhrasesField')}:{' '}
          {rule.compositeSpec.bodyContainsAny.join(separator)}
        </div>
      </>
    );
  }
  return (
    <>
      <div style={mono}>
        {t('settings.deterministicCategoryRules.ruleType')}:{' '}
        {rule.ruleType ?? t('settings.deterministicCategoryRules.notApplicableMark')}
      </div>
      <div style={mono}>
        {t('settings.deterministicCategoryRules.pattern')}: {rule.pattern}
      </div>
      {rule.subjectPrefix ? (
        <div style={mono}>
          {t('settings.deterministicCategoryRules.subjectPrefix')}: {rule.subjectPrefix}
        </div>
      ) : null}
    </>
  );
};

const CategoryRuleRowFooter: React.FC<{ rule: CategoryRuleDto }> = ({ rule }) => {
  const { t } = useTranslation();
  const isLegacy = rule.ruleKind !== CATEGORY_RULE_KIND_COMPOSITE;
  return (
    <>
      {isLegacy ? (
        <div style={legacyWeakRuleBannerStyle}>
          {t('settings.deterministicCategoryRules.legacyWeakWarning')}
        </div>
      ) : null}
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        {t('settings.deterministicCategoryRules.hits', { count: rule.hitCount })}
      </div>
    </>
  );
};

export interface DeterministicCategoryRuleRowProps {
  rule: CategoryRuleDto;
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDelete: (id: string) => void;
  onEditComposite?: (rule: CategoryRuleDto) => void;
  onUpgradeToComposite?: (rule: CategoryRuleDto) => void;
}

export const DeterministicCategoryRuleRow: React.FC<DeterministicCategoryRuleRowProps> = ({
  rule,
  onToggleEnabled,
  onDelete,
  onEditComposite,
  onUpgradeToComposite,
}) => {
  const { t } = useTranslation();
  const isComposite = rule.ruleKind === CATEGORY_RULE_KIND_COMPOSITE;
  const isLegacy = !isComposite;
  const kindLabel = isComposite
    ? t('settings.deterministicCategoryRules.kindComposite')
    : t('settings.deterministicCategoryRules.kindLegacy');

  return (
    <div style={rowStyle}>
      <CategoryRuleRowHeader
        rule={rule}
        isComposite={isComposite}
        isLegacy={isLegacy}
        kindLabel={kindLabel}
        onToggleEnabled={onToggleEnabled}
        onDelete={onDelete}
        onEditComposite={onEditComposite}
        onUpgradeToComposite={onUpgradeToComposite}
      />
      <CategoryRuleRowSpecBody rule={rule} />
      <CategoryRuleRowFooter rule={rule} />
    </div>
  );
};
