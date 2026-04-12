import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { CategoryRuleDto } from 'types/category-rules.types';
import { specSenders, specSubjects } from 'types/category-rules.types';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

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
  const kindLabel = isComposite
    ? t('settings.deterministicCategoryRules.kindComposite')
    : t('settings.deterministicCategoryRules.kindLegacy');

  const renderCompositeSpec = () => {
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
  };

  return (
    <div style={rowStyle}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{rule.categoryName}</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            padding: `2px ${theme.spacing.xs}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          {kindLabel}
        </span>
        {!rule.isEnabled && (
          <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
            ({t('settings.deterministicCategoryRules.disabled')})
          </span>
        )}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            marginLeft: 'auto',
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          <input
            type="checkbox"
            checked={rule.isEnabled}
            onChange={event => onToggleEnabled(rule.id, event.target.checked)}
          />
          {t('settings.deterministicCategoryRules.enabledToggle')}
        </label>
        {isComposite && onEditComposite ? (
          <button type="button" style={btnStyle} onClick={() => onEditComposite(rule)}>
            {t('common.edit')}
          </button>
        ) : null}
        {!isComposite && onUpgradeToComposite ? (
          <button type="button" style={btnStyle} onClick={() => onUpgradeToComposite(rule)}>
            {t('settings.deterministicCategoryRules.upgradeToComposite')}
          </button>
        ) : null}
        <button type="button" style={btnStyle} onClick={() => onDelete(rule.id)}>
          {t('common.delete')}
        </button>
      </div>

      {isComposite ? (
        renderCompositeSpec()
      ) : (
        <>
          <div style={mono}>
            {t('settings.deterministicCategoryRules.ruleType')}: {rule.ruleType ?? '—'}
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
      )}

      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        {t('settings.deterministicCategoryRules.hits', { count: rule.hitCount })}
      </div>
    </div>
  );
};
