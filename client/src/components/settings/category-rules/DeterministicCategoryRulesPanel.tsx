import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { DeterministicCategoryRuleRow } from 'components/settings/category-rules/DeterministicCategoryRuleRow';

export interface DeterministicCategoryRulesPanelProps {
  rules: CategoryRuleDto[];
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDelete: (id: string) => Promise<void>;
  onEditComposite?: (rule: CategoryRuleDto) => void;
  onUpgradeToComposite?: (rule: CategoryRuleDto) => void;
}

export const DeterministicCategoryRulesPanel: React.FC<DeterministicCategoryRulesPanelProps> = ({
  rules,
  onToggleEnabled,
  onDelete,
  onEditComposite,
  onUpgradeToComposite,
}) => {
  const { t } = useTranslation();

  if (rules.length === 0) {
    return (
      <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, margin: 0 }}>
        {t('settings.deterministicCategoryRules.empty')}
      </p>
    );
  }

  return (
    <div>
      <p
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          margin: `0 0 ${theme.spacing.md} 0`,
        }}
      >
        {t('settings.deterministicCategoryRules.intro')}
      </p>
      {rules.map(rule => (
        <DeterministicCategoryRuleRow
          key={rule.id}
          rule={rule}
          onToggleEnabled={onToggleEnabled}
          onDelete={onDelete}
          onEditComposite={onEditComposite}
          onUpgradeToComposite={onUpgradeToComposite}
        />
      ))}
    </div>
  );
};
