import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';
import type { CategoryRuleDto } from 'types/category-rules.types';
import {
  specBodyNotContains,
  specSenders,
  specSubjectNotContains,
  specSubjects,
} from 'types/category-rules.types';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';
import { EMOJI_WARNING } from 'constants/emojis';

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

const warningBadgeStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.warning.light,
  border: `1px solid ${theme.colors.warning.main}`,
  color: theme.colors.text.secondary,
  cursor: 'pointer',
};

const brokenBadgeStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.feedback?.error || '#d32f2f',
  color: '#fff',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export interface DeterministicCategoryRuleRowProps {
  rule: CategoryRuleDto;
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDelete: (id: string) => Promise<void>;
  onEditComposite?: (rule: CategoryRuleDto) => void;
  onUpgradeToComposite?: (rule: CategoryRuleDto) => void;
}

const CompositeSpecSummary: React.FC<{ rule: CategoryRuleDto; t: TFunction }> = ({ rule, t }) => {
  if (!rule.compositeSpec) {
    return null;
  }
  const senders = specSenders(rule.compositeSpec);
  const subjects = specSubjects(rule.compositeSpec);
  const subjectNot = specSubjectNotContains(rule.compositeSpec);
  const bodyNot = specBodyNotContains(rule.compositeSpec);
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
      {subjectNot.length > 0 ? (
        <div style={mono}>
          {t('settings.deterministicCategoryRules.subjectNotContainsField')}: {subjectNot.join(separator)}
        </div>
      ) : null}
      {bodyNot.length > 0 ? (
        <div style={mono}>
          {t('settings.deterministicCategoryRules.bodyNotContainsField')}: {bodyNot.join(separator)}
        </div>
      ) : null}
    </>
  );
};

const RuleRowHeader: React.FC<DeterministicCategoryRuleRowProps & { isComposite: boolean; t: TFunction }> = ({
  rule,
  onToggleEnabled,
  onDelete,
  onEditComposite,
  onUpgradeToComposite,
  isComposite,
  t,
}) => {
  const kindLabel = isComposite
    ? t('settings.deterministicCategoryRules.kindComposite')
    : t('settings.deterministicCategoryRules.kindLegacy');
  return (
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
      {!rule.categoryId && (
        <span style={brokenBadgeStyle} title={t('settings.deterministicCategoryRules.brokenTooltip')}>
          {t('settings.deterministicCategoryRules.brokenBadge')}
        </span>
      )}
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
      {!isComposite && (
        <button
          type="button"
          title={t('settings.deterministicCategoryRules.legacyWeakWarning')}
          onClick={() => onEditComposite?.(rule)}
          style={warningBadgeStyle}
        >
          {EMOJI_WARNING} {t('settings.deterministicCategoryRules.upgradeToComposite')}
        </button>
      )}
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
  );
};

export const DeterministicCategoryRuleRow: React.FC<DeterministicCategoryRuleRowProps> = (props) => {
  const { rule } = props;
  const { t } = useTranslation();
  const isComposite = rule.ruleKind === CATEGORY_RULE_KIND_COMPOSITE;

  return (
    <div style={rowStyle}>
      <RuleRowHeader {...props} isComposite={isComposite} t={t} />

      {isComposite ? (
        <CompositeSpecSummary rule={rule} t={t} />
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
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        <span>{t('settings.deterministicCategoryRules.hits', { count: rule.hitCount })}</span>
        {rule.createdAt ? (
          <span>
            {t('settings.deterministicCategoryRules.createdAt', {
              date: new Date(rule.createdAt).toLocaleDateString(),
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
};
