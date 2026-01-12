import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { SummarizationRuleItem } from 'components/settings/guide-ai/SummarizationRuleItem';
import { SummarizationRuleAddForm } from 'components/settings/guide-ai/SummarizationRuleAddForm';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

interface SummarizationRulesSectionProps {
  summarizationRules: SummarizationRule[];
  newSummarizationWhen: string;
  newSummarizationHow: string;
  editingSummarizationRule: string | null;
  editSummarizationWhen: string;
  editSummarizationHow: string;
  onAddSummarizationRule: () => Promise<void>;
  onEditSummarizationRule: (rule: SummarizationRule) => void;
  onSaveSummarizationRule: (ruleId: string) => Promise<void>;
  onDeleteSummarizationRule: (ruleId: string) => Promise<void>;
  onNewSummarizationWhenChange: (value: string) => void;
  onNewSummarizationHowChange: (value: string) => void;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onEditingSummarizationRuleChange: (ruleId: string | null) => void;
}

export const SummarizationRulesSection: React.FC<SummarizationRulesSectionProps> = ({
  summarizationRules,
  newSummarizationWhen,
  newSummarizationHow,
  editingSummarizationRule,
  editSummarizationWhen,
  editSummarizationHow,
  onAddSummarizationRule,
  onEditSummarizationRule,
  onSaveSummarizationRule,
  onDeleteSummarizationRule,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onEditingSummarizationRuleChange,
}) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div id="summarization" style={{
      marginTop: theme.spacing.lg,
    }}>
      <h3 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.lg,
        scrollMarginTop: `${INPUT_WIDTH_PX}px`,
      }}>
        {t('settings.summarizationRules')}
      </h3>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.lg,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.summarizationRulesDesc')}
      </p>
      
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
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
          onNewSummarizationWhenChange={onNewSummarizationWhenChange}
          onNewSummarizationHowChange={onNewSummarizationHowChange}
          onAddSummarizationRule={async () => {
            await onAddSummarizationRule();
            setShowAddForm(false);
          }}
        />
      )}

      {/* Existing Rules */}
      {summarizationRules.length === 0 ? (
        <div style={{
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          border: `2px dashed ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}>
          {t('settings.noSummarizationRules')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {summarizationRules.map((rule) => (
            <SummarizationRuleItem
              key={rule.ruleId}
              rule={rule}
              editingSummarizationRule={editingSummarizationRule}
              editSummarizationWhen={editSummarizationWhen}
              editSummarizationHow={editSummarizationHow}
              onEditSummarizationWhenChange={onEditSummarizationWhenChange}
              onEditSummarizationHowChange={onEditSummarizationHowChange}
              onSaveSummarizationRule={onSaveSummarizationRule}
              onEditingSummarizationRuleChange={onEditingSummarizationRuleChange}
              onEditSummarizationRule={onEditSummarizationRule}
              onDeleteSummarizationRule={onDeleteSummarizationRule}
            />
          ))}
        </div>
      )}
    </div>
  );
};

