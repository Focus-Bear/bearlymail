import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface SummarizationRuleEditFormProps {
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
  onSave: () => Promise<void>;
  onCancel: () => void;
}

interface RuleFormFieldsProps {
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
}

const RuleFormFields: React.FC<RuleFormFieldsProps> = ({
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
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div>
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
          value={editSummarizationWhen}
          onChange={event => onEditSummarizationWhenChange(event.target.value)}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
      </div>
      <div>
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
          value={editSummarizationHow}
          onChange={event => onEditSummarizationHowChange(event.target.value)}
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
      <div>
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
          value={editFromPatterns}
          onChange={event => onEditFromPatternsChange(event.target.value)}
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
      <div>
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
          value={editSubjectPatterns}
          onChange={event => onEditSubjectPatternsChange(event.target.value)}
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
      <div>
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
          value={editPriority}
          onChange={event => onEditPriorityChange(Number(event.target.value))}
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
    </>
  );
};

export const SummarizationRuleEditForm: React.FC<SummarizationRuleEditFormProps> = ({
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
  onSave,
  onCancel,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <RuleFormFields
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
        />
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={onSave}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.save')}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
