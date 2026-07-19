import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';

import type { CategoryDebugData } from './CategoryDebugModal.types';

const COLOR_WHITE = '#fff';

/** The draft returned by POST /category-rules/draft-from-email. */
interface CompositeRuleDraft {
  categoryName: string;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
  exclusionsDerived: boolean;
}

/** Editable form state — arrays edited as newline-separated text. */
interface DraftForm {
  senderMatchesAny: string;
  subjectContainsAny: string;
  bodyContainsAny: string;
  subjectNotContainsAny: string;
  bodyNotContainsAny: string;
}

function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function draftToForm(draft: CompositeRuleDraft): DraftForm {
  return {
    senderMatchesAny: draft.senderMatchesAny.join('\n'),
    subjectContainsAny: draft.subjectContainsAny.join('\n'),
    bodyContainsAny: draft.bodyContainsAny.join('\n'),
    subjectNotContainsAny: draft.subjectNotContainsAny.join('\n'),
    bodyNotContainsAny: draft.bodyNotContainsAny.join('\n'),
  };
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.secondary,
  marginBottom: 2,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: theme.spacing.xs,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
  fontSize: theme.typography.fontSize.sm,
  fontFamily: 'inherit',
  resize: 'vertical',
  minHeight: 44,
};

interface PhraseFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const PhraseField: React.FC<PhraseFieldProps> = ({ label, value, onChange }) => (
  <div style={{ marginBottom: theme.spacing.sm }}>
    <label style={labelStyle}>{label}</label>
    <textarea style={textareaStyle} value={value} onChange={ev => onChange(ev.target.value)} rows={2} />
  </div>
);

const CATEGORY_DATALIST_ID = 'draft-rule-category-options';

interface CategoryPickerProps {
  categories: CategoryDebugData['emailCategories'];
  value: string;
  onChange: (value: string) => void;
  translate: TFunction;
}

/**
 * Typeahead category field: a free-text input backed by a datalist of the
 * user's existing categories. Typing filters the suggestions, and any value
 * (existing or new) is accepted — so this serves both "pick existing" and
 * "create a new category" without a separate custom-name field.
 */
const CategoryPicker: React.FC<CategoryPickerProps> = ({ categories, value, onChange, translate }) => (
  <div style={{ marginBottom: theme.spacing.sm }}>
    <label style={labelStyle} htmlFor="draft-rule-category">
      {translate('priority.categoryDebug.draftRule.categoryLabel')}
    </label>
    <input
      id="draft-rule-category"
      type="text"
      role="combobox"
      list={CATEGORY_DATALIST_ID}
      value={value}
      onChange={ev => onChange(ev.target.value)}
      placeholder={translate('priority.categoryDebug.draftRule.categoryPlaceholder')}
      autoComplete="off"
      style={{ ...textareaStyle, minHeight: 0, height: 34 }}
    />
    <datalist id={CATEGORY_DATALIST_ID}>
      {categories.map(category => (
        <option key={category.id} value={category.name} />
      ))}
    </datalist>
    <p
      style={{
        ...labelStyle,
        fontWeight: theme.typography.fontWeight.normal,
        color: theme.colors.text.tertiary,
        marginTop: 2,
      }}
    >
      {translate('priority.categoryDebug.draftRule.categoryTypeaheadHint')}
    </p>
  </div>
);

interface CategoryDebugDraftRulePanelProps {
  emailId: string;
  categories: CategoryDebugData['emailCategories'];
  onClose: () => void;
}

const buttonBaseStyle: React.CSSProperties = {
  borderRadius: theme.borderRadius.sm,
  cursor: 'pointer',
  padding: `6px ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.sm,
  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
};

/**
 * Inline panel for drafting a deterministic category rule from the current
 * email. Asks which category the thread should have had, then calls the
 * LLM-assisted authoring endpoint and shows the draft in editable fields for
 * review before saving via the normal create-rule endpoint.
 */
export const CategoryDebugDraftRulePanel: React.FC<CategoryDebugDraftRulePanelProps> = ({
  emailId,
  categories,
  onClose,
}) => {
  const { t: translate } = useTranslation();
  const [categoryName, setCategoryName] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [exclusionsDerived, setExclusionsDerived] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const resolvedCategoryName = useMemo(() => categoryName.trim(), [categoryName]);

  const updateField = useCallback((key: keyof DraftForm, value: string) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
    // Editing after a save means there are unsaved changes again — clear the
    // success message and re-enable saving.
    setSaved(false);
  }, []);

  const handleDraft = useCallback(async () => {
    if (!resolvedCategoryName) {
      setError(translate('priority.categoryDebug.draftRule.errorCategoryRequired'));
      return;
    }
    setDrafting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await axios.post<CompositeRuleDraft>(
        `${API_URL}/category-rules/draft-from-email`,
        { emailId, categoryName: resolvedCategoryName }
      );
      setForm(draftToForm(response.data));
      setExclusionsDerived(response.data.exclusionsDerived);
    } catch {
      setError(translate('priority.categoryDebug.draftRule.errorDraftFailed'));
    } finally {
      setDrafting(false);
    }
  }, [emailId, resolvedCategoryName, translate]);

  const handleSave = useCallback(async () => {
    if (!form) {
      return;
    }
    const payload = {
      categoryName: resolvedCategoryName,
      senderMatchesAny: linesToArray(form.senderMatchesAny),
      subjectContainsAny: linesToArray(form.subjectContainsAny),
      bodyContainsAny: linesToArray(form.bodyContainsAny),
      subjectNotContainsAny: linesToArray(form.subjectNotContainsAny),
      bodyNotContainsAny: linesToArray(form.bodyNotContainsAny),
    };
    if (
      payload.senderMatchesAny.length === 0 ||
      payload.subjectContainsAny.length === 0 ||
      payload.bodyContainsAny.length === 0
    ) {
      setError(translate('priority.categoryDebug.draftRule.errorFieldsRequired'));
      return;
    }
    if (payload.subjectNotContainsAny.length === 0 && payload.bodyNotContainsAny.length === 0) {
      setError(translate('priority.categoryDebug.draftRule.errorNeedsExclusion'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/category-rules`, payload);
      setSaved(true);
    } catch {
      setError(translate('priority.categoryDebug.draftRule.errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [form, resolvedCategoryName, translate]);

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${theme.colors.primary?.main || '#1976d2'}`,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.xs,
        }}
      >
        <strong style={{ fontSize: theme.typography.fontSize.sm }}>
          {translate('priority.categoryDebug.draftRule.title')}
        </strong>
        <button
          type="button"
          onClick={onClose}
          style={{ ...buttonBaseStyle, padding: `2px ${theme.spacing.sm}`, background: 'transparent' }}
        >
          {translate('priority.categoryDebug.draftRule.cancel')}
        </button>
      </div>
      <p
        style={{
          margin: `0 0 ${theme.spacing.sm} 0`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
        }}
      >
        {translate('priority.categoryDebug.draftRule.intro')}
      </p>

      <CategoryPicker
        categories={categories}
        value={categoryName}
        onChange={setCategoryName}
        translate={translate}
      />

      <button
        type="button"
        onClick={() => void handleDraft()}
        disabled={drafting || !resolvedCategoryName}
        style={{
          ...buttonBaseStyle,
          background: theme.colors.primary?.main || '#1976d2',
          color: COLOR_WHITE,
          border: 'none',
          cursor: drafting || !resolvedCategoryName ? 'not-allowed' : 'pointer',
          opacity: drafting || !resolvedCategoryName ? OPACITY_DISABLED_ALT : OPACITY_FULL,
        }}
      >
        {drafting
          ? translate('priority.categoryDebug.draftRule.generating')
          : translate('priority.categoryDebug.draftRule.generate')}
      </button>

      {form ? (
        <div style={{ marginTop: theme.spacing.sm }}>
          {!exclusionsDerived ? (
            <p
              role="alert"
              style={{
                margin: `0 0 ${theme.spacing.sm} 0`,
                padding: theme.spacing.xs,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.primary,
                backgroundColor: theme.colors.warning?.light || '#fff4e5',
                border: `1px solid ${theme.colors.warning?.main || '#ed6c02'}`,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {form.subjectNotContainsAny.trim() || form.bodyNotContainsAny.trim()
                ? translate('priority.categoryDebug.draftRule.suggestedExclusionsNote')
                : translate('priority.categoryDebug.draftRule.noExclusionsDerived')}
            </p>
          ) : null}
          <PhraseField
            label={translate('priority.categoryDebug.draftRule.senderLabel')}
            value={form.senderMatchesAny}
            onChange={value => updateField('senderMatchesAny', value)}
          />
          <PhraseField
            label={translate('priority.categoryDebug.draftRule.subjectLabel')}
            value={form.subjectContainsAny}
            onChange={value => updateField('subjectContainsAny', value)}
          />
          <PhraseField
            label={translate('priority.categoryDebug.draftRule.bodyLabel')}
            value={form.bodyContainsAny}
            onChange={value => updateField('bodyContainsAny', value)}
          />
          <PhraseField
            label={translate('priority.categoryDebug.draftRule.subjectExcludeLabel')}
            value={form.subjectNotContainsAny}
            onChange={value => updateField('subjectNotContainsAny', value)}
          />
          <PhraseField
            label={translate('priority.categoryDebug.draftRule.bodyExcludeLabel')}
            value={form.bodyNotContainsAny}
            onChange={value => updateField('bodyNotContainsAny', value)}
          />
          <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, margin: `0 0 ${theme.spacing.sm}` }}>
            {translate('priority.categoryDebug.draftRule.exclusionHint')}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || saved}
            style={{
              ...buttonBaseStyle,
              background: theme.colors.feedback?.success || '#388e3c',
              color: COLOR_WHITE,
              border: 'none',
              cursor: saving ? 'wait' : saved ? 'not-allowed' : 'pointer',
            }}
          >
            {saving
              ? translate('priority.categoryDebug.draftRule.saving')
              : translate('priority.categoryDebug.draftRule.save')}
          </button>
        </div>
      ) : null}

      {saved ? (
        <p style={{ marginTop: theme.spacing.sm, color: theme.colors.feedback?.success || '#388e3c', fontSize: theme.typography.fontSize.sm }}>
          {translate('priority.categoryDebug.draftRule.saved')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ marginTop: theme.spacing.sm, color: theme.colors.feedback?.error || '#d32f2f', fontSize: theme.typography.fontSize.sm }}>
          {error}
        </p>
      ) : null}
    </div>
  );
};
