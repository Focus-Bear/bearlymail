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

const requiredAsterisk: React.CSSProperties = {
  color: theme.colors.error.main,
  marginLeft: '2px',
};

const errorTextStyle: React.CSSProperties = {
  margin: `${theme.spacing.xs} 0 0`,
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.error.main,
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: theme.colors.error.main,
};

const textareaErrorStyle: React.CSSProperties = {
  ...textareaStyle,
  borderColor: theme.colors.error.main,
};

const labelBlockStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  fontSize: theme.typography.fontSize.sm,
};

const helpParagraphStyle: React.CSSProperties = {
  margin: `${theme.spacing.xs} 0 0`,
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
};

interface LinesFieldSectionProps {
  labelText: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  helpText: string;
  error?: string;
  rows: number;
  minHeight?: string;
  footerHint?: string;
}

const LinesFieldSection: React.FC<LinesFieldSectionProps> = ({
  labelText,
  value,
  onValueChange,
  placeholder,
  helpText,
  error,
  rows,
  minHeight,
  footerHint,
}) => {
  const baseTextareaStyle = error ? textareaErrorStyle : textareaStyle;
  const mergedTextareaStyle = minHeight ? { ...baseTextareaStyle, minHeight } : baseTextareaStyle;
  return (
    <div>
      <label style={labelBlockStyle}>
        {labelText}
        <span style={requiredAsterisk} aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={mergedTextareaStyle}
        aria-invalid={!!error}
      />
      {error ? (
        <p role="alert" style={errorTextStyle}>
          {error}
        </p>
      ) : (
        <p style={helpParagraphStyle}>{helpText}</p>
      )}
      {footerHint ? <p style={helpParagraphStyle}>{footerHint}</p> : null}
    </div>
  );
};

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
        <label style={labelBlockStyle}>
          {t('settings.deterministicCategoryRules.categoryNameField')}
          <span style={requiredAsterisk} aria-hidden="true">
            *
          </span>
        </label>
        <input
          type="text"
          list="category-rule-category-options"
          value={categoryName}
          onChange={(event) => onCategoryNameChange(event.target.value)}
          placeholder={t('settings.deterministicCategoryRules.categoryPlaceholder')}
          style={errors?.categoryName ? inputErrorStyle : inputStyle}
          aria-invalid={!!errors?.categoryName}
        />
        <datalist id="category-rule-category-options">
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.name} />
          ))}
        </datalist>
        {errors?.categoryName ? (
          <p role="alert" style={errorTextStyle}>
            {errors.categoryName}
          </p>
        ) : (
          <p style={helpParagraphStyle}>{t('settings.deterministicCategoryRules.categoryHelp')}</p>
        )}
      </div>
      <LinesFieldSection
        labelText={t('settings.deterministicCategoryRules.senderField')}
        value={senderLines}
        onValueChange={onSenderLinesChange}
        placeholder={t('settings.deterministicCategoryRules.senderPlaceholder')}
        helpText={t('settings.deterministicCategoryRules.senderHelp')}
        error={errors?.senders}
        rows={3}
      />
      <LinesFieldSection
        labelText={t('settings.deterministicCategoryRules.subjectContainsField')}
        value={subjectLines}
        onValueChange={onSubjectLinesChange}
        placeholder={t('settings.deterministicCategoryRules.subjectPlaceholder')}
        helpText={t('settings.deterministicCategoryRules.subjectHelp')}
        error={errors?.subjects}
        rows={3}
      />
      <LinesFieldSection
        labelText={t('settings.deterministicCategoryRules.bodyPhrasesField')}
        value={bodyLines}
        onValueChange={onBodyLinesChange}
        placeholder={t('settings.deterministicCategoryRules.bodyPhrasesPlaceholder')}
        helpText={t('settings.deterministicCategoryRules.bodyPhrasesHelp')}
        error={errors?.bodyPhrases}
        rows={5}
        minHeight="100px"
        footerHint={t('settings.deterministicCategoryRules.allFieldsRequired')}
      />
    </div>
  );
};
