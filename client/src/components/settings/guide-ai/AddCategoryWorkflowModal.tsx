import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive } from 'react-icons/fi';
import { theme } from 'theme/theme';
import {
  createCategoryArchiveWorkflow,
  respondToCategoryArchiveSuggestion,
} from 'utils/categoryArchiveWorkflow';

import { useNotifications } from 'contexts/NotificationContext';

interface AddCategoryWorkflowModalProps {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
}

/**
 * "Add workflow" for a category. For now the only workflow offered is
 * automatically archiving emails tagged with the category. Saving creates the
 * workflow and records the suggestion as accepted so we don't later re-prompt.
 */
export const AddCategoryWorkflowModal: React.FC<AddCategoryWorkflowModalProps> = ({
  categoryId,
  categoryName,
  onClose,
}) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await createCategoryArchiveWorkflow(
        categoryId,
        t('settings.categoryWorkflows.autoArchiveName', { category: categoryName })
      );
    } catch {
      // Only a creation failure is worth surfacing (and retryable).
      showError(t('settings.categoryWorkflows.createError'));
      setSaving(false);
      return;
    }
    // Recording the response is best-effort — the workflow already exists, so a
    // failure here must not read as a creation error (which would prompt a retry
    // and create a duplicate workflow).
    await respondToCategoryArchiveSuggestion(categoryId, 'accepted').catch(() => undefined);
    showSuccess(t('settings.categoryWorkflows.created', { category: categoryName }));
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.colors.overlay.dark,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          background: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          width: '100%',
          maxWidth: 460,
          boxShadow: theme.shadows.xl,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.lg }}>
          {t('settings.categoryWorkflows.addTitle', { category: categoryName })}
        </h3>

        <div
          style={{
            display: 'flex',
            gap: theme.spacing.sm,
            alignItems: 'flex-start',
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.default}`,
            background: theme.colors.background.subtle,
          }}
        >
          <FiArchive size={18} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.md }}>
              {t('settings.categoryWorkflows.archiveOptionTitle')}
            </div>
            <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
              {t('settings.categoryWorkflows.archiveOptionDescription', { category: categoryName })}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: theme.spacing.sm,
            marginTop: theme.spacing.lg,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.default}`,
              background: theme.colors.background.paper,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: 'none',
              background: theme.colors.primary.main,
              color: theme.colors.text.inverse,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {saving ? t('common.saving') : t('settings.categoryWorkflows.createButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCategoryWorkflowModal;
