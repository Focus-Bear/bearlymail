import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  fromPatterns: string[];
  subjectPatterns: string[];
  priority: number;
  createdAt?: string;
}

interface SummarizationRuleDisplayProps {
  rule: SummarizationRule;
  onEdit: () => void;
  onDelete: () => void;
}

export const SummarizationRuleDisplay: React.FC<SummarizationRuleDisplayProps> = ({ rule, onEdit, onDelete }) => {
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
          <div
            style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.medium,
              marginBottom: theme.spacing.xs,
            }}
          >
            📋 {rule.whenToUse}
          </div>
          {rule.fromPatterns.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
                marginBottom: theme.spacing.xs,
              }}
            >
              <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
                {t('settings.fromPatterns')}:
              </span>
              {rule.fromPatterns.map(pattern => (
                <span
                  key={pattern}
                  style={{
                    backgroundColor: theme.colors.background.subtle,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.sm,
                    padding: `0 ${theme.spacing.xs}`,
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.secondary,
                    fontFamily: 'monospace',
                  }}
                >
                  {pattern}
                </span>
              ))}
            </div>
          )}
          {rule.subjectPatterns.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
                marginBottom: theme.spacing.xs,
              }}
            >
              <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
                {t('settings.subjectPatterns')}:
              </span>
              {rule.subjectPatterns.map(pattern => (
                <span
                  key={pattern}
                  style={{
                    backgroundColor: theme.colors.background.subtle,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.sm,
                    padding: `0 ${theme.spacing.xs}`,
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.secondary,
                    fontFamily: 'monospace',
                  }}
                >
                  {pattern}
                </span>
              ))}
            </div>
          )}
          <div
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.xs,
            }}
          >
            → {rule.howToSummarize}
          </div>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={onEdit}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
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
              backgroundColor: COLOR_TRANSPARENT,
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
