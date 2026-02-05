import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { ModalBackdrop, ModalContent, ModalHeader, ModalFooter } from 'components/modal';

import { API_URL } from 'config/api';

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
  const [newCategory, setNewCategory] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newCategory.trim()) return;

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/emails/${emailId}/category-override`, {
        category: newCategory.trim(),
        reason: reasonText.trim() || undefined,
      });
      
      if (onSubmitted) {
        onSubmitted(newCategory.trim());
      }
      onClose();
    } catch (error) {
      console.error('Error submitting category override:', error);
      alert(t('priority.categoryOverride.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
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
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={t('priority.categoryOverride.categoryPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontFamily: theme.typography.fontFamily,
            }}
          />
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
            }}
          />
        </div>

        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          canSubmit={!!newCategory.trim()}
        />
      </ModalContent>
    </ModalBackdrop>
  );
};
