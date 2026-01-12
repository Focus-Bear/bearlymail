import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

interface SummarizationRuleDisplayProps {
  rule: SummarizationRule;
  onEdit: () => void;
  onDelete: () => void;
}

export const SummarizationRuleDisplay: React.FC<SummarizationRuleDisplayProps> = ({
  rule,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.xs,
          }}>
            📋 {rule.whenToUse}
          </div>
          <div style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.xs,
          }}>
            → {rule.howToSummarize}
          </div>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={onEdit}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {t('common.edit')}
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              color: theme.colors.accent.error,
              border: `1px solid ${theme.colors.accent.error}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};





