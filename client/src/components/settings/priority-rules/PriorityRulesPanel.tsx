import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { PriorityRuleDto } from 'types/priority-rules.types';

import { PriorityRuleRow } from 'components/settings/priority-rules/PriorityRuleRow';

export interface PriorityRulesPanelProps {
  rules: PriorityRuleDto[];
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onEdit: (rule: PriorityRuleDto) => void;
  onDelete: (rule: PriorityRuleDto) => void;
}

export const PriorityRulesPanel: React.FC<PriorityRulesPanelProps> = ({
  rules,
  onToggleEnabled,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();

  if (rules.length === 0) {
    return (
      <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, margin: 0 }}>
        {t('settings.priorityRules.empty')}
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
        {t('settings.priorityRules.intro')}
      </p>
      {rules.map(rule => (
        <PriorityRuleRow
          key={rule.id}
          rule={rule}
          onToggleEnabled={onToggleEnabled}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};
