import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { SummarizationRuleAddForm } from 'components/settings/guide-ai/SummarizationRuleAddForm';
import { SummarizationRuleItem } from 'components/settings/guide-ai/SummarizationRuleItem';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const itemCount = summarizationRules.length;

  return (
    <div id="summarization" style={{
      marginTop: theme.spacing.lg,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background.paper,
    }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.primary,
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          cursor: 'pointer',
          backgroundColor: theme.colors.background.paper,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
          borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md,
          transition: theme.transitions.fast,
          scrollMarginTop: `${INPUT_WIDTH_PX}px`,
        }}
      >
        <span
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: theme.transitions.fast,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
          {t('settings.summarizationRules')}
        </span>
        <span
          style={{
            backgroundColor: theme.colors.greyscale[300],
            color: theme.colors.text.secondary,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.full,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {itemCount}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: theme.spacing.md }}>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}>
            {t('settings.summarizationRulesDesc')}
          </p>

          {!showAddForm && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddForm(true); }}
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
      )}
    </div>
  );
};

