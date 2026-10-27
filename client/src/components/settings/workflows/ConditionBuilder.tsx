import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CategoryNamesById, describeCategoryScope } from './describeWorkflowCondition';
import { PatternTagInput } from './PatternTagInput';
import { WorkflowCondition } from './types';

interface ConditionBuilderProps {
  condition: WorkflowCondition;
  onChange: (condition: WorkflowCondition) => void;
  categoryNamesById: CategoryNamesById;
}

type PatternField = 'fromPatterns' | 'subjectPatterns' | 'bodyPatterns';

const PATTERN_FIELDS: ReadonlyArray<{
  field: PatternField;
  labelKey: string;
  hintKey: string;
  placeholderKey: string;
}> = [
  {
    field: 'fromPatterns',
    labelKey: 'settings.workflows.condition.fromLabel',
    hintKey: 'settings.workflows.condition.fromHint',
    placeholderKey: 'settings.workflows.condition.fromPlaceholder',
  },
  {
    field: 'subjectPatterns',
    labelKey: 'settings.workflows.condition.subjectLabel',
    hintKey: 'settings.workflows.condition.subjectHint',
    placeholderKey: 'settings.workflows.condition.subjectPlaceholder',
  },
  {
    field: 'bodyPatterns',
    labelKey: 'settings.workflows.condition.bodyLabel',
    hintKey: 'settings.workflows.condition.bodyHint',
    placeholderKey: 'settings.workflows.condition.bodyPlaceholder',
  },
];

const EMPTY_INPUTS: Record<PatternField, string> = { fromPatterns: '', subjectPatterns: '', bodyPatterns: '' };

/**
 * Builds the "When" condition part of a workflow rule.
 * Supports from/subject/body patterns and an optional natural-language condition.
 */
export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({ condition, onChange, categoryNamesById }) => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(condition.naturalLanguageCondition));

  const setInput = (field: PatternField, value: string) => setInputs(current => ({ ...current, [field]: value }));

  const addPattern = (field: PatternField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onChange({ ...condition, [field]: [...(condition[field] ?? []), trimmed] });
    setInput(field, '');
  };

  const removePattern = (field: PatternField, index: number) => {
    const updated = [...(condition[field] ?? [])];
    updated.splice(index, 1);
    onChange({ ...condition, [field]: updated });
  };

  const labelStyle: React.CSSProperties = {
    ...theme.typography.body.small,
    fontWeight: 600,
    color: theme.colors.text.primary,
    marginBottom: 4,
    display: 'block',
  };

  const categoryScope = describeCategoryScope(condition, categoryNamesById, t);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {categoryScope && (
        <p
          style={{
            ...theme.typography.body.small,
            margin: 0,
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            background: theme.colors.background.subtle,
            border: `1px solid ${theme.colors.border.default}`,
            color: theme.colors.text.secondary,
          }}
        >
          {t('settings.workflows.condition.categoryScopeNote', { category: categoryScope })}
        </p>
      )}
      {PATTERN_FIELDS.map(({ field, labelKey, hintKey, placeholderKey }) => (
        <div key={field}>
          <label style={labelStyle}>{t(labelKey)}</label>
          <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, marginBottom: 4 }}>
            {t(hintKey)}
          </p>
          <PatternTagInput
            patterns={condition[field] ?? []}
            inputValue={inputs[field]}
            onInputChange={value => setInput(field, value)}
            onAdd={value => addPattern(field, value)}
            onRemove={index => removePattern(field, index)}
            placeholder={t(placeholderKey)}
          />
        </div>
      ))}

      {/* Advanced: natural language condition */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.primary.main,
            fontSize: 13,
            padding: 0,
          }}
        >
          {showAdvanced
            ? t('settings.workflows.condition.hideAdvanced')
            : t('settings.workflows.condition.showAdvanced')}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: theme.spacing.sm }}>
            <label style={labelStyle}>{t('settings.workflows.condition.naturalLanguageLabel')}</label>
            <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, marginBottom: 4 }}>
              {t('settings.workflows.condition.naturalLanguageHint')}
            </p>
            <textarea
              value={condition.naturalLanguageCondition ?? ''}
              onChange={evt => onChange({ ...condition, naturalLanguageCondition: evt.target.value || null })}
              placeholder={t('settings.workflows.condition.naturalLanguagePlaceholder')}
              style={{
                width: '100%',
                minHeight: 80,
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.colors.border.default}`,
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
