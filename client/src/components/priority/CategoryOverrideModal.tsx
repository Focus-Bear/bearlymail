import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent, ModalFooter,ModalHeader } from 'components/modal';
import { API_URL } from 'config/api';

const ADD_NEW_VALUE = '__add_new__';

interface CategorySelectProps {
  existingCategories: string[]; loadingCategories: boolean; isAddingNew: boolean;
  selectedCategory: string; customCategory: string;
  onSelectChange: (v: string) => void; onCustomChange: (v: string) => void;
  labelStyle: React.CSSProperties; selectStyle: React.CSSProperties; inputStyle: React.CSSProperties;
  t: (tKey: string) => string;
}

const CategorySelectField: React.FC<CategorySelectProps> = ({
  existingCategories, loadingCategories, isAddingNew, selectedCategory, customCategory,
  onSelectChange, onCustomChange, labelStyle, selectStyle, inputStyle, t,
}) => (
  <div style={{ marginBottom: theme.spacing.md }}>
    <label style={labelStyle}>{t('priority.categoryOverride.newCategory')}:</label>
    <select value={isAddingNew ? ADD_NEW_VALUE : selectedCategory} onChange={(event) => onSelectChange(event.target.value)} disabled={loadingCategories} style={selectStyle}>
      <option value="" disabled>{loadingCategories ? t('priority.categoryOverride.loadingCategories') : t('priority.categoryOverride.selectPlaceholder')}</option>
      {existingCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
      <option value={ADD_NEW_VALUE}>{t('priority.categoryOverride.addNewCategory')}</option>
    </select>
    {isAddingNew && <input type="text" autoFocus value={customCategory} onChange={(event) => onCustomChange(event.target.value)} placeholder={t('priority.categoryOverride.categoryPlaceholder')} style={{ ...inputStyle, marginTop: theme.spacing.sm }} />}
  </div>
);

interface CategoryOverrideModalProps {
  emailId: string;
  currentCategory: string;
  onClose: () => void;
  onSubmitted?: (newCategory: string) => void;
}

export const CategoryOverrideModal: React.FC<CategoryOverrideModalProps> = ({
  emailId,
  currentCategory,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch all known categories from the API on mount so the dropdown is
  // populated from the full dataset, not just emails loaded in Redux.
  useEffect(() => {
    let cancelled = false;
    setLoadingCategories(true);
    axios
      .get<string[]>(`${API_URL}/emails/categories`)
      .then((res) => {
        if (!cancelled) {
          // Exclude the current category so "move to same category" isn't offered
          setExistingCategories(
            res.data.filter((cat) => cat !== currentCategory),
          );
        }
      })
      .catch((err) => {
        console.error('Failed to load categories:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCategory]);

  const resolvedCategory = isAddingNew ? customCategory.trim() : selectedCategory;

  const handleSelectChange = (value: string) => {
    if (value === ADD_NEW_VALUE) {
      setIsAddingNew(true);
      setSelectedCategory('');
    } else {
      setIsAddingNew(false);
      setSelectedCategory(value);
      setCustomCategory('');
    }
  };

  const handleSubmit = async () => {
    if (!resolvedCategory) return;

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/emails/${emailId}/category-override`, { category: resolvedCategory, reason: reasonText.trim() || undefined, });
      
      if (onSubmitted) {
        onSubmitted(resolvedCategory);
      }
      onClose();
    } catch (error) {
      console.error('Error submitting category override:', error);
      alert(t('priority.categoryOverride.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyle: React.CSSProperties = { width: '100%', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily, backgroundColor: theme.colors.background.paper, color: theme.colors.text.primary, cursor: 'pointer', appearance: 'auto' as React.CSSProperties['appearance'], };

  const inputStyle: React.CSSProperties = { width: '100%', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily, boxSizing: 'border-box', };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeader title={t('priority.categoryOverride.title')} />

        <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginBottom: theme.spacing.md, lineHeight: theme.typography.lineHeight.relaxed, }}>
          {t('priority.categoryOverride.description', { category: currentCategory })}
        </p>

        <CategorySelectField existingCategories={existingCategories} loadingCategories={loadingCategories} isAddingNew={isAddingNew} selectedCategory={selectedCategory} customCategory={customCategory} onSelectChange={handleSelectChange} onCustomChange={setCustomCategory} labelStyle={{ display: 'block', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary, marginBottom: theme.spacing.xs }} selectStyle={selectStyle} inputStyle={inputStyle} t={t} />
        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{ display: 'block', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary, marginBottom: theme.spacing.xs }}>{t('priority.categoryOverride.reason')}:</label>
          <textarea value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder={t('priority.categoryOverride.reasonPlaceholder')} style={{ width: '100%', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily, resize: 'vertical', minHeight: '80px', boxSizing: 'border-box' }} />
        </div>

        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          canSubmit={!!resolvedCategory}
        />
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};
