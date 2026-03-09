import React from 'react';

import { SummarizationRuleDisplay } from 'components/settings/guide-ai/SummarizationRuleDisplay';
import { SummarizationRuleEditForm } from 'components/settings/guide-ai/SummarizationRuleEditForm';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  fromPatterns: string[];
  subjectPatterns: string[];
  priority: number;
  createdAt?: string;
}

interface SummarizationRuleItemProps {
  rule: SummarizationRule;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  editFromPatterns: string;
  editSubjectPatterns: string;
  editPriority: number;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onEditFromPatternsChange: (value: string) => void;
  onEditSubjectPatternsChange: (value: string) => void;
  onEditPriorityChange: (value: number) => void;
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
  editFromPatterns,
  editSubjectPatterns,
  editPriority,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onEditFromPatternsChange,
  onEditSubjectPatternsChange,
  onEditPriorityChange,
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
        editFromPatterns={editFromPatterns}
        editSubjectPatterns={editSubjectPatterns}
        editPriority={editPriority}
        onEditSummarizationWhenChange={onEditSummarizationWhenChange}
        onEditSummarizationHowChange={onEditSummarizationHowChange}
        onEditFromPatternsChange={onEditFromPatternsChange}
        onEditSubjectPatternsChange={onEditSubjectPatternsChange}
        onEditPriorityChange={onEditPriorityChange}
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
