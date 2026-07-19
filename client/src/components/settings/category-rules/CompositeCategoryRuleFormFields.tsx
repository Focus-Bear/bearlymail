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
  subjectNotPhrases?: string;
  bodyNotPhrases?: string;
}

export interface CompositeCategoryRuleFormFieldsProps {
  categoryOptions: CategoryOption[];
  /** The chosen category's UUID (EMAIL_CATEGORY contextId) — the authoritative link. */
  categoryId: string;
  senderLines: string;
  subjectLines: string;
  bodyLines: string;
  /** Issue #1789: optional subject exclusion phrases (one per line). */
  subjectNotLines: string;
  /** Issue #1789: optional body exclusion phrases (one per line). */
  bodyNotLines: string;
  onCategoryChange: (categoryId: string) => void;
  onSenderLinesChange: (value: string) => void;
  onSubjectLinesChange: (value: string) => void;
  onBodyLinesChange: (value: string) => void;
  onSubjectNotLinesChange: (value: string) => void;
  onBodyNotLinesChange: (value: string) => void;
  errors?: CompositeCategoryRuleFormFieldErrors;
}

export const CompositeCategoryRuleFormFields: React.FC<CompositeCategoryRuleFormFieldsProps> = ({
  categoryOptions,
  categoryId,
  senderLines,
  subjectLines,
  bodyLines,
  subjectNotLines,
  bodyNotLines,
  onCategoryChange,
  onSenderLinesChange,
  onSubjectLinesChange,
  onBodyLinesChange,
  onSubjectNotLinesChange,
  onBodyNotLinesChange,
  errors,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.categoryNameField')}
        </label>
        <select
          value={categoryId}
          onChange={event => onCategoryChange(event.target.value)}
          style={inputStyle}
        >
          <option value="">{t('settings.deterministicCategoryRules.categoryPlaceholder')}</option>
          {categoryOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
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
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.subjectNotContainsField')}
        </label>
        <textarea
          value={subjectNotLines}
          onChange={event => onSubjectNotLinesChange(event.target.value)}
          rows={2}
          placeholder={t('settings.deterministicCategoryRules.subjectNotContainsPlaceholder')}
          style={textareaStyle}
        />
        {errors?.subjectNotPhrases ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.subjectNotPhrases}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.subjectNotContainsHelp')}
        </p>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.bodyNotContainsField')}
        </label>
        <textarea
          value={bodyNotLines}
          onChange={event => onBodyNotLinesChange(event.target.value)}
          rows={3}
          placeholder={t('settings.deterministicCategoryRules.bodyNotContainsPlaceholder')}
          style={textareaStyle}
        />
        {errors?.bodyNotPhrases ? (
          <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.error.main }}>
            {errors.bodyNotPhrases}
          </p>
        ) : null}
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.bodyNotContainsHelp')}
        </p>
      </div>
    </div>
  );
};
