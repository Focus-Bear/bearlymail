import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryOption } from 'queries/useCategoryContextQuery';
import { theme } from 'theme/theme';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  fontSize: theme.typography.fontSize.sm,
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '60px',
};

export interface CompositeCategoryRuleFormFieldErrors {
  categoryName?: string;
  senders?: string;
  subjects?: string;
  bodyPhrases?: string;
}

export interface CompositeCategoryRuleFormFieldsProps {
  categoryOptions: CategoryOption[];
  categoryName: string;
  senderLines: string;
  subjectLines: string;
  bodyLines: string;
  onCategoryNameChange: (value: string) => void;
  onSenderLinesChange: (value: string) => void;
  onSubjectLinesChange: (value: string) => void;
  onBodyLinesChange: (value: string) => void;
  errors?: CompositeCategoryRuleFormFieldErrors;
}

export const CompositeCategoryRuleFormFields: React.FC<CompositeCategoryRuleFormFieldsProps> = ({
  categoryOptions,
  categoryName,
  senderLines,
  subjectLines,
  bodyLines,
  onCategoryNameChange,
  onSenderLinesChange,
  onSubjectLinesChange,
  onBodyLinesChange,
  errors,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.categoryNameField')}
        </label>
        <input
          type="text"
          list="category-rule-category-options"
          value={categoryName}
          onChange={event => onCategoryNameChange(event.target.value)}
          placeholder={t('settings.deterministicCategoryRules.categoryPlaceholder')}
          style={inputStyle}
        />
        <datalist id="category-rule-category-options">
          {categoryOptions.map(option => (
            <option key={option.id} value={option.name} />
          ))}
        </datalist>
        {errors?.categoryName ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.categoryName}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.categoryHelp')}
        </p>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.senderField')}
        </label>
        <textarea
          value={senderLines}
          onChange={event => onSenderLinesChange(event.target.value)}
          rows={3}
          placeholder={t('settings.deterministicCategoryRules.senderPlaceholder')}
          style={textareaStyle}
        />
        {errors?.senders ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.senders}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.senderHelp')}
        </p>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.subjectContainsField')}
        </label>
        <textarea
          value={subjectLines}
          onChange={event => onSubjectLinesChange(event.target.value)}
          rows={3}
          placeholder={t('settings.deterministicCategoryRules.subjectPlaceholder')}
          style={textareaStyle}
        />
        {errors?.subjects ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.subjects}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.subjectHelp')}
        </p>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.bodyPhrasesField')}
        </label>
        <textarea
          value={bodyLines}
          onChange={event => onBodyLinesChange(event.target.value)}
          rows={5}
          placeholder={t('settings.deterministicCategoryRules.bodyPhrasesPlaceholder')}
          style={{ ...textareaStyle, minHeight: '100px' }}
        />
        {errors?.bodyPhrases ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.bodyPhrases}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.bodyPhrasesHelp')}
        </p>
      </div>
    </div>
  );
};
