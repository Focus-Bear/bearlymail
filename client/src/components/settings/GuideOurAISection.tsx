import React from 'react';
import { theme } from 'theme/theme';
import { ContextAboutMeSection } from 'components/settings/guide-ai/ContextAboutMeSection';
import { ToneSettingsSection } from 'components/settings/guide-ai/ToneSettingsSection';
import { SummarizationRulesSection } from 'components/settings/guide-ai/SummarizationRulesSection';
import { GuideOurAISectionHeader } from 'components/settings/guide-ai/GuideOurAISectionHeader';

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number;
  explanation?: string;
}

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

interface GuideOurAISectionProps {
  contexts: UserContext[];
  toneRules: string[];
  summarizationRules: SummarizationRule[];
  analyzing: boolean;
  newToneRule: string;
  newSummarizationWhen: string;
  newSummarizationHow: string;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  newContextValue: string;
  newContextPriority: number;
  addingContextType: string | null;
  editingContextId: string | null;
  editContextValue: string;
  editContextPriority: number;
  displayName?: string;
  jobTitle?: string;
  onAnalyzeContext: () => Promise<void>;
  onAddToneRule: () => void;
  onRemoveToneRule: (index: number) => void;
  onNewToneRuleChange: (rule: string) => void;
  onAddSummarizationRule: () => Promise<void>;
  onEditSummarizationRule: (rule: SummarizationRule) => void;
  onSaveSummarizationRule: (ruleId: string) => Promise<void>;
  onDeleteSummarizationRule: (ruleId: string) => Promise<void>;
  onNewSummarizationWhenChange: (value: string) => void;
  onNewSummarizationHowChange: (value: string) => void;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onEditingSummarizationRuleChange: (ruleId: string | null) => void;
  onAddContext: () => Promise<void>;
  onUpdateContext: () => Promise<void>;
  onDeleteContext: (contextId: string) => Promise<void>;
  onNewContextValueChange: (value: string) => void;
  onNewContextPriorityChange: (priority: number) => void;
  onAddingContextTypeChange: (type: string | null) => void;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
  onEditContextPriorityChange: (priority: number) => void;
  onUpdateProfile?: (updates: { displayName?: string; jobTitle?: string }) => Promise<void>;
}

export const GuideOurAISection: React.FC<GuideOurAISectionProps> = ({
  contexts,
  toneRules,
  summarizationRules,
  analyzing,
  newToneRule,
  newSummarizationWhen,
  newSummarizationHow,
  editingSummarizationRule,
  editSummarizationWhen,
  editSummarizationHow,
  newContextValue,
  newContextPriority,
  addingContextType,
  editingContextId,
  editContextValue,
  editContextPriority,
  displayName,
  jobTitle,
  onAnalyzeContext,
  onAddToneRule,
  onRemoveToneRule,
  onNewToneRuleChange,
  onAddSummarizationRule,
  onEditSummarizationRule,
  onSaveSummarizationRule,
  onDeleteSummarizationRule,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onEditingSummarizationRuleChange,
  onAddContext,
  onUpdateContext,
  onDeleteContext,
  onNewContextValueChange,
  onNewContextPriorityChange,
  onAddingContextTypeChange,
  onEditingContextIdChange,
  onEditContextValueChange,
  onEditContextPriorityChange,
  onUpdateProfile,
}) => {
  return (
    <div id="guide-our-ai" style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      boxShadow: theme.shadows.md,
    }}>
      <GuideOurAISectionHeader />

      <ContextAboutMeSection
        contexts={contexts}
        analyzing={analyzing}
        addingContextType={addingContextType}
        editingContextId={editingContextId}
        editContextValue={editContextValue}
        newContextValue={newContextValue}
        displayName={displayName}
        jobTitle={jobTitle}
        onAnalyzeContext={onAnalyzeContext}
        onAddContext={onAddContext}
        onUpdateContext={onUpdateContext}
        onDeleteContext={onDeleteContext}
        onNewContextValueChange={onNewContextValueChange}
        onAddingContextTypeChange={onAddingContextTypeChange}
        onEditingContextIdChange={onEditingContextIdChange}
        onEditContextValueChange={onEditContextValueChange}
        onUpdateProfile={onUpdateProfile}
      />

      <ToneSettingsSection
        toneRules={toneRules}
        newToneRule={newToneRule}
        onAddToneRule={onAddToneRule}
        onRemoveToneRule={onRemoveToneRule}
        onNewToneRuleChange={onNewToneRuleChange}
      />

      <SummarizationRulesSection
        summarizationRules={summarizationRules}
        newSummarizationWhen={newSummarizationWhen}
        newSummarizationHow={newSummarizationHow}
        editingSummarizationRule={editingSummarizationRule}
        editSummarizationWhen={editSummarizationWhen}
        editSummarizationHow={editSummarizationHow}
        onAddSummarizationRule={onAddSummarizationRule}
        onEditSummarizationRule={onEditSummarizationRule}
        onSaveSummarizationRule={onSaveSummarizationRule}
        onDeleteSummarizationRule={onDeleteSummarizationRule}
        onNewSummarizationWhenChange={onNewSummarizationWhenChange}
        onNewSummarizationHowChange={onNewSummarizationHowChange}
        onEditSummarizationWhenChange={onEditSummarizationWhenChange}
        onEditSummarizationHowChange={onEditSummarizationHowChange}
        onEditingSummarizationRuleChange={onEditingSummarizationRuleChange}
      />
    </div>
  );
};

