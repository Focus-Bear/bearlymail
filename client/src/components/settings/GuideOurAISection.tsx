import React from 'react';
import { theme } from 'theme/theme';

import { DeterministicCategoryRulesSection } from 'components/settings/category-rules/DeterministicCategoryRulesSection';
import { CategoryFamiliesSection } from 'components/settings/guide-ai/CategoryFamiliesSection';
import { ContextAboutMeSection } from 'components/settings/guide-ai/ContextAboutMeSection';
import { GuideOurAISectionHeader } from 'components/settings/guide-ai/GuideOurAISectionHeader';
import { SummarizationRulesSection } from 'components/settings/guide-ai/SummarizationRulesSection';
import { ToneSettingsSection } from 'components/settings/guide-ai/ToneSettingsSection';
import { PriorityRulesSection } from 'components/settings/priority-rules/PriorityRulesSection';
import { CategoryPromotionContext } from 'contexts/CategoryPromotionContext';
import { CategoryRuleFromCategoryContext } from 'contexts/CategoryRuleFromCategoryContext';
import { useCategoryPromotions } from 'hooks/settings/useCategoryPromotions';
import { useDeterministicCategoryRulesSectionState } from 'hooks/settings/useDeterministicCategoryRulesSectionState';

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
  fromPatterns: string[];
  subjectPatterns: string[];
  priority: number;
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
  newFromPatterns: string;
  newSubjectPatterns: string;
  newPriority: number;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  editFromPatterns: string;
  editSubjectPatterns: string;
  editPriority: number;
  newContextValue: string;
  newContextPriority: number;
  addingContextType: string | null;
  editingContextId: string | null;
  editContextValue: string;
  editContextPriority: number;
  displayName?: string;
  jobTitle?: string;
  calendarBookingUrl?: string;
  onAnalyzeContext: () => Promise<void>;
  onAddToneRule: () => void;
  onRemoveToneRule: (index: number) => void;
  onEditToneRule?: (index: number, newValue: string) => void;
  onNewToneRuleChange: (rule: string) => void;
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
  onAddContext: () => Promise<void>;
  onUpdateContext: () => Promise<void>;
  onDeleteContext: (contextId: string) => Promise<void>;
  onNewContextValueChange: (value: string) => void;
  onNewContextPriorityChange: (priority: number) => void;
  onAddingContextTypeChange: (type: string | null) => void;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
  onEditContextPriorityChange: (priority: number) => void;
  onUpdateProfile?: (updates: {
    displayName?: string;
    jobTitle?: string;
    calendarBookingUrl?: string;
  }) => Promise<void>;
  onRefreshContexts?: () => void;
}

export const GuideOurAISection: React.FC<GuideOurAISectionProps> = ({
  contexts,
  toneRules,
  summarizationRules,
  analyzing,
  newToneRule,
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
  newContextValue,
  newContextPriority,
  addingContextType,
  editingContextId,
  editContextValue,
  editContextPriority,
  displayName,
  jobTitle,
  calendarBookingUrl,
  onAnalyzeContext,
  onAddToneRule,
  onRemoveToneRule,
  onEditToneRule,
  onNewToneRuleChange,
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
  onRefreshContexts,
}) => {
  const deterministicCategoryRulesController = useDeterministicCategoryRulesSectionState();
  const { getPromotion } = useCategoryPromotions();

  return (
    <CategoryPromotionContext.Provider value={{ getPromotion }}>
    <CategoryRuleFromCategoryContext.Provider
      value={{
        openAddRuleForCategoryDisplayName: deterministicCategoryRulesController.openAddChoiceForCategoryDisplayName,
        rules: deterministicCategoryRulesController.rules,
        onToggleEnabled: deterministicCategoryRulesController.handleToggle,
        onDeleteRule: deterministicCategoryRulesController.handleDelete,
        onEditRule: deterministicCategoryRulesController.openEdit,
      }}
    >
      <div
        id="guide-our-ai"
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}
      >
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
          calendarBookingUrl={calendarBookingUrl}
          onAnalyzeContext={onAnalyzeContext}
          onAddContext={onAddContext}
          onUpdateContext={onUpdateContext}
          onDeleteContext={onDeleteContext}
          onNewContextValueChange={onNewContextValueChange}
          onAddingContextTypeChange={onAddingContextTypeChange}
          onEditingContextIdChange={onEditingContextIdChange}
          onEditContextValueChange={onEditContextValueChange}
          onUpdateProfile={onUpdateProfile}
          onRefreshContexts={onRefreshContexts}
        />

        <DeterministicCategoryRulesSection controller={deterministicCategoryRulesController} />

        <CategoryFamiliesSection />

        <PriorityRulesSection />

        <ToneSettingsSection
          toneRules={toneRules}
          newToneRule={newToneRule}
          onAddToneRule={onAddToneRule}
          onRemoveToneRule={onRemoveToneRule}
          onEditToneRule={onEditToneRule}
          onNewToneRuleChange={onNewToneRuleChange}
        />

        <SummarizationRulesSection
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
      </div>
    </CategoryRuleFromCategoryContext.Provider>
    </CategoryPromotionContext.Provider>
  );
};
