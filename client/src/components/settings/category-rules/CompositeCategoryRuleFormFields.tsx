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

export interface CompositeCategoryRuleFormFieldsProps {
  categoryOptions: CategoryOption[];
  categoryName: string;
  sender: string;
  subjectContains: string;
  bodyLines: string;
  onCategoryNameChange: (value: string) => void;
  onSenderChange: (value: string) => void;
  onSubjectContainsChange: (value: string) => void;
  onBodyLinesChange: (value: string) => void;
}

export const CompositeCategoryRuleFormFields: React.FC<CompositeCategoryRuleFormFieldsProps> = ({
  categoryOptions,
  categoryName,
  sender,
  subjectContains,
  bodyLines,
  onCategoryNameChange,
  onSenderChange,
  onSubjectContainsChange,
  onBodyLinesChange,
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
        <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          {t('settings.deterministicCategoryRules.categoryHelp')}
        </p>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.senderField')}
        </label>
        <input type="text" value={sender} onChange={event => onSenderChange(event.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.deterministicCategoryRules.subjectContainsField')}
        </label>
        <input
          type="text"
          value={subjectContains}
          onChange={event => onSubjectContainsChange(event.target.value)}
          style={inputStyle}
        />
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
          style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }}
        />
        <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          {t('settings.deterministicCategoryRules.bodyPhrasesHelp')}
        </p>
      </div>
    </div>
  );
};
