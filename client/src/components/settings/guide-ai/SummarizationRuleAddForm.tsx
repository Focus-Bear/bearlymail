import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { INPUT_WIDTH_PX } from 'constants/numbers';

interface SummarizationRuleAddFormProps {
  newSummarizationWhen: string;
  newSummarizationHow: string;
  newFromPatterns: string;
  newSubjectPatterns: string;
  newPriority: number;
  onNewSummarizationWhenChange: (value: string) => void;
  onNewSummarizationHowChange: (value: string) => void;
  onNewFromPatternsChange: (value: string) => void;
  onNewSubjectPatternsChange: (value: string) => void;
  onNewPriorityChange: (value: number) => void;
  onAddSummarizationRule: () => Promise<void>;
}

export const SummarizationRuleAddForm: React.FC<SummarizationRuleAddFormProps> = ({
  newSummarizationWhen,
  newSummarizationHow,
  newFromPatterns,
  newSubjectPatterns,
  newPriority,
  onNewSummarizationWhenChange,
  onNewSummarizationHowChange,
  onNewFromPatternsChange,
  onNewSubjectPatternsChange,
  onNewPriorityChange,
  onAddSummarizationRule,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.subtle,
        marginBottom: theme.spacing.lg,
      }}
    >
      <h4
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.base,
        }}
      >
        {t('settings.addSummarizationRule')}
      </h4>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.whenToUse')}
        </label>
        <input
          type="text"
          value={newSummarizationWhen}
          onChange={event => onNewSummarizationWhenChange(event.target.value)}
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
        <label
          style={{
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.howToSummarize')}
        </label>
        <textarea
          value={newSummarizationHow}
          onChange={event => onNewSummarizationHowChange(event.target.value)}
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
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.fromPatterns')}
        </label>
        <input
          type="text"
          value={newFromPatterns}
          onChange={event => onNewFromPatternsChange(event.target.value)}
          placeholder={t('settings.fromPatternsPlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
        <small style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
          {t('settings.fromPatternsHelp')}
        </small>
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.subjectPatterns')}
        </label>
        <input
          type="text"
          value={newSubjectPatterns}
          onChange={event => onNewSubjectPatternsChange(event.target.value)}
          placeholder={t('settings.subjectPatternsPlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
        <small style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
          {t('settings.subjectPatternsHelp')}
        </small>
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          style={{
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.priority')}
        </label>
        <input
          type="number"
          min={0}
          value={newPriority}
          onChange={event => onNewPriorityChange(Number(event.target.value))}
          style={{
            width: '80px',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
        <small style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, display: 'block' }}>
          {t('settings.priorityHelp')}
        </small>
      </div>
      <button
        onClick={onAddSummarizationRule}
        disabled={!newSummarizationWhen.trim() || !newSummarizationHow.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor:
            newSummarizationWhen.trim() && newSummarizationHow.trim()
              ? theme.colors.primary.main
              : theme.colors.background.subtle,
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
