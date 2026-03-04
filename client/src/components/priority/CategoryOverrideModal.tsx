import React, { useMemo,useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent, ModalFooter,ModalHeader } from 'components/modal';
import { API_URL } from 'config/api';
import { selectEmails } from 'store/selectors/emailSelectors';

const ADD_NEW_VALUE = '__add_new__';

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
  const emails = useSelector(selectEmails);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    emails.forEach(email => {
      // Filter out the sentinel value to prevent collision with the "Add new" option
      if (email.category && email.category !== currentCategory && email.category !== ADD_NEW_VALUE) {
        categories.add(email.category);
      }
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [emails, currentCategory]);

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
      await axios.post(`${API_URL}/emails/${emailId}/category-override`, {
        category: resolvedCategory,
        reason: reasonText.trim() || undefined,
      });
      
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

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.sm,
    fontFamily: theme.typography.fontFamily,
    backgroundColor: theme.colors.background.paper,
    color: theme.colors.text.primary,
    cursor: 'pointer',
    appearance: 'auto' as React.CSSProperties['appearance'],
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.sm,
    fontFamily: theme.typography.fontFamily,
    boxSizing: 'border-box',
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeader title={t('priority.categoryOverride.title')} />

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          {t('priority.categoryOverride.description', { category: currentCategory })}
        </p>

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            {t('priority.categoryOverride.newCategory')}:
          </label>
          <select
            value={isAddingNew ? ADD_NEW_VALUE : selectedCategory}
            onChange={(e) => handleSelectChange(e.target.value)}
            style={selectStyle}
          >
            <option value="" disabled>
              {t('priority.categoryOverride.selectPlaceholder')}
            </option>
            {existingCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value={ADD_NEW_VALUE}>
              {t('priority.categoryOverride.addNewCategory')}
            </option>
          </select>
          {isAddingNew && (
            <input
              type="text"
              autoFocus
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder={t('priority.categoryOverride.categoryPlaceholder')}
              style={{ ...inputStyle, marginTop: theme.spacing.sm }}
            />
          )}
        </div>

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            {t('priority.categoryOverride.reason')}:
          </label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={t('priority.categoryOverride.reasonPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontFamily: theme.typography.fontFamily,
              resize: 'vertical',
              minHeight: '80px',
              boxSizing: 'border-box',
            }}
          />
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
