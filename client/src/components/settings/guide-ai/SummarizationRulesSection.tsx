import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CollapsibleSettingsSection } from 'components/settings/CollapsibleSettingsSection';
import { SummarizationRuleAddForm } from 'components/settings/guide-ai/SummarizationRuleAddForm';
import { SummarizationRuleItem } from 'components/settings/guide-ai/SummarizationRuleItem';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { STRING_NONE } from 'constants/strings';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  fromPatterns: string[];
  subjectPatterns: string[];
  priority: number;
  createdAt?: string;
}

interface SummarizationRulesSectionProps {
  summarizationRules: SummarizationRule[];
  newSummarizationWhen: string;
  newSummarizationHow: string;
  newFromPatterns: string;
  newSubjectPatterns: string;
  newPriority: number;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  editFromPatterns: string;
  editSubjectPatterns: string;
  editPriority: number;
  onAddSummarizationRule: () => Promise<void>;
  onEditSummarizationRule: (rule: SummarizationRule) => void;
  onSaveSummarizationRule: (ruleId: string) => Promise<void>;
  onDeleteSummarizationRule: (ruleId: string) => Promise<void>;
  onNewSummarizationWhenChange: (value: string) => void;
  onNewSummarizationHowChange: (value: string) => void;
  onNewFromPatternsChange: (value: string) => void;
  onNewSubjectPatternsChange: (value: string) => void;
  onNewPriorityChange: (value: number) => void;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onEditFromPatternsChange: (value: string) => void;
  onEditSubjectPatternsChange: (value: string) => void;
  onEditPriorityChange: (value: number) => void;
  onEditingSummarizationRuleChange: (ruleId: string | null) => void;
}

interface SummarizationRulesContentProps extends SummarizationRulesSectionProps {
  showAddForm: boolean;
  onShowAddForm: (show: boolean) => void;
}

const SummarizationRulesContent: React.FC<SummarizationRulesContentProps> = ({
  summarizationRules,
  newSummarizationWhen,
  newSummarizationHow,
  newFromPatterns,
  newSubjectPatterns,
  newPriority,
  editingSummarizationRule,
  editSummarizationWhen,
  editSummarizationHow,
  editFromPatterns,
  editSubjectPatterns,
  editPriority,
  showAddForm,
  onShowAddForm,
  onAddSummarizationRule,
  onEditSummarizationRule,
  onSaveSummarizationRule,
  onDeleteSummarizationRule,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onNewFromPatternsChange,
  onNewSubjectPatternsChange,
  onNewPriorityChange,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onEditFromPatternsChange,
  onEditSubjectPatternsChange,
  onEditPriorityChange,
  onEditingSummarizationRuleChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.summarizationRulesDesc')}
      </p>

      {!showAddForm && (
        <button
          onClick={event => {
            event.stopPropagation();
            onShowAddForm(true);
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.lg,
          }}
        >
          {t('settings.addRule')}
        </button>
      )}

      {showAddForm && (
        <SummarizationRuleAddForm
          newSummarizationWhen={newSummarizationWhen}
          newSummarizationHow={newSummarizationHow}
          newFromPatterns={newFromPatterns}
          newSubjectPatterns={newSubjectPatterns}
          newPriority={newPriority}
          onNewSummarizationWhenChange={onNewSummarizationWhenChange}
          onNewSummarizationHowChange={onNewSummarizationHowChange}
          onNewFromPatternsChange={onNewFromPatternsChange}
          onNewSubjectPatternsChange={onNewSubjectPatternsChange}
          onNewPriorityChange={onNewPriorityChange}
          onAddSummarizationRule={async () => {
            await onAddSummarizationRule();
            onShowAddForm(false);
          }}
        />
      )}

      {summarizationRules.length === 0 ? (
        <div
          style={{
            padding: theme.spacing.xl,
            textAlign: 'center',
            color: theme.colors.text.secondary,
            border: `2px dashed ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.md,
          }}
        >
          {t('settings.noSummarizationRules')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {summarizationRules.map(rule => (
            <SummarizationRuleItem
              key={rule.ruleId}
              rule={rule}
              editingSummarizationRule={editingSummarizationRule}
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
              onSaveSummarizationRule={onSaveSummarizationRule}
              onEditingSummarizationRuleChange={onEditingSummarizationRuleChange}
              onEditSummarizationRule={onEditSummarizationRule}
              onDeleteSummarizationRule={onDeleteSummarizationRule}
            />
          ))}
        </div>
      )}
    </>
  );
};

export const SummarizationRulesSection: React.FC<SummarizationRulesSectionProps> = ({
  summarizationRules,
  newSummarizationWhen,
  newSummarizationHow,
  newFromPatterns,
  newSubjectPatterns,
  newPriority,
  editingSummarizationRule,
  editSummarizationWhen,
  editSummarizationHow,
  editFromPatterns,
  editSubjectPatterns,
  editPriority,
  onAddSummarizationRule,
  onEditSummarizationRule,
  onSaveSummarizationRule,
  onDeleteSummarizationRule,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onNewFromPatternsChange,
  onNewSubjectPatternsChange,
  onNewPriorityChange,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onEditFromPatternsChange,
  onEditSubjectPatternsChange,
  onEditPriorityChange,
  onEditingSummarizationRuleChange,
}) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <CollapsibleSettingsSection
      anchorId={SETTINGS_ANCHORS.SUMMARIZATION_RULES}
      title={t('settings.summarizationRules')}
      itemCount={summarizationRules.length}
      shouldUnmountBodyWhenCollapsed
    >
      <SummarizationRulesContent
        summarizationRules={summarizationRules}
        newSummarizationWhen={newSummarizationWhen}
        newSummarizationHow={newSummarizationHow}
        newFromPatterns={newFromPatterns}
        newSubjectPatterns={newSubjectPatterns}
        newPriority={newPriority}
        editingSummarizationRule={editingSummarizationRule}
        editSummarizationWhen={editSummarizationWhen}
        editSummarizationHow={editSummarizationHow}
        editFromPatterns={editFromPatterns}
        editSubjectPatterns={editSubjectPatterns}
        editPriority={editPriority}
        showAddForm={showAddForm}
        onShowAddForm={setShowAddForm}
        onAddSummarizationRule={onAddSummarizationRule}
        onEditSummarizationRule={onEditSummarizationRule}
        onSaveSummarizationRule={onSaveSummarizationRule}
        onDeleteSummarizationRule={onDeleteSummarizationRule}
        onNewSummarizationWhenChange={onNewSummarizationWhenChange}
        onNewSummarizationHowChange={onNewSummarizationHowChange}
        onNewFromPatternsChange={onNewFromPatternsChange}
        onNewSubjectPatternsChange={onNewSubjectPatternsChange}
        onNewPriorityChange={onNewPriorityChange}
        onEditSummarizationWhenChange={onEditSummarizationWhenChange}
        onEditSummarizationHowChange={onEditSummarizationHowChange}
        onEditFromPatternsChange={onEditFromPatternsChange}
        onEditSubjectPatternsChange={onEditSubjectPatternsChange}
        onEditPriorityChange={onEditPriorityChange}
        onEditingSummarizationRuleChange={onEditingSummarizationRuleChange}
      />
    </CollapsibleSettingsSection>
  );
};
