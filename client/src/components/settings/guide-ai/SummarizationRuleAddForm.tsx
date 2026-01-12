import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';

interface SummarizationRuleAddFormProps {
  newSummarizationWhen: string;
  newSummarizationHow: string;
  onNewSummarizationWhenChange: (value: string) => void;
  onNewSummarizationHowChange: (value: string) => void;
  onAddSummarizationRule: () => Promise<void>;
}

export const SummarizationRuleAddForm: React.FC<SummarizationRuleAddFormProps> = ({
  newSummarizationWhen,
  newSummarizationHow,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onAddSummarizationRule,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{
      padding: theme.spacing.lg,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background.subtle,
      marginBottom: theme.spacing.lg,
    }}>
      <h4 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.base }}>
        {t('settings.addSummarizationRule')}
      </h4>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.whenToUse')}
        </label>
        <input
          type="text"
          value={newSummarizationWhen}
          onChange={(e) => onNewSummarizationWhenChange(e.target.value)}
          placeholder={t('settings.whenToUsePlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.howToSummarize')}
        </label>
        <textarea
          value={newSummarizationHow}
          onChange={(e) => onNewSummarizationHowChange(e.target.value)}
          placeholder={t('settings.howToSummarizePlaceholder')}
          style={{
            width: '100%',
            minHeight: `${INPUT_WIDTH_PX}px`,
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            resize: 'vertical',
          }}
        />
      </div>
      <button
        onClick={onAddSummarizationRule}
        disabled={!newSummarizationWhen.trim() || !newSummarizationHow.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: newSummarizationWhen.trim() && newSummarizationHow.trim() ? theme.colors.primary.main : theme.colors.background.subtle,
          color: newSummarizationWhen.trim() && newSummarizationHow.trim() ? 'white' : theme.colors.text.tertiary,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: newSummarizationWhen.trim() && newSummarizationHow.trim() ? 'pointer' : 'not-allowed',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.addRule')}
      </button>
    </div>
  );
};


