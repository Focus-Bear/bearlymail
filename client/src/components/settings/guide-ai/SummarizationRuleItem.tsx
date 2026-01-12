import React from 'react';
import { SummarizationRuleEditForm } from 'components/settings/guide-ai/SummarizationRuleEditForm';
import { SummarizationRuleDisplay } from 'components/settings/guide-ai/SummarizationRuleDisplay';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

interface SummarizationRuleItemProps {
  rule: SummarizationRule;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onSaveSummarizationRule: (ruleId: string) => Promise<void>;
  onEditingSummarizationRuleChange: (ruleId: string | null) => void;
  onEditSummarizationRule: (rule: SummarizationRule) => void;
  onDeleteSummarizationRule: (ruleId: string) => Promise<void>;
}

export const SummarizationRuleItem: React.FC<SummarizationRuleItemProps> = ({
  rule,
  editingSummarizationRule,
  editSummarizationWhen,
  editSummarizationHow,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onSaveSummarizationRule,
  onEditingSummarizationRuleChange,
  onEditSummarizationRule,
  onDeleteSummarizationRule,
}) => {
  if (editingSummarizationRule === rule.ruleId) {
    return (
      <SummarizationRuleEditForm
        editSummarizationWhen={editSummarizationWhen}
        editSummarizationHow={editSummarizationHow}
        onEditSummarizationWhenChange={onEditSummarizationWhenChange}
        onEditSummarizationHowChange={onEditSummarizationHowChange}
        onSave={() => onSaveSummarizationRule(rule.ruleId)}
        onCancel={() => onEditingSummarizationRuleChange(null)}
      />
    );
  }

  return (
    <SummarizationRuleDisplay
      rule={rule}
      onEdit={() => onEditSummarizationRule(rule)}
      onDelete={() => onDeleteSummarizationRule(rule.ruleId)}
    />
  );
};

