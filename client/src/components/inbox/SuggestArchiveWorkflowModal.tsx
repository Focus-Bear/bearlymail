import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import {
  CategoryArchiveSuggestion,
  createCategoryArchiveWorkflow,
  respondToCategoryArchiveSuggestion,
} from 'utils/categoryArchiveWorkflow';

import { useNotifications } from 'contexts/NotificationContext';

interface SuggestArchiveWorkflowModalProps {
  suggestion: CategoryArchiveSuggestion;
  onClose: () => void;
}

/**
 * Shown after the user repeatedly archives a whole category without engaging.
 * Offers to set up an auto-archive workflow for it. Either choice is recorded
 * server-side so we stop suggesting.
 */
export const SuggestArchiveWorkflowModal: React.FC<SuggestArchiveWorkflowModalProps> = ({
  suggestion,
  onClose,
}) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [busy, setBusy] = useState(false);
  const { categoryId, categoryName } = suggestion;

  const handleAccept = async () => {
    setBusy(true);
    try {
      await createCategoryArchiveWorkflow(
        categoryId,
        t('settings.categoryWorkflows.autoArchiveName', { category: categoryName })
      );
    } catch {
      // Only a creation failure is worth surfacing (and retryable).
      showError(t('settings.categoryWorkflows.createError'));
      setBusy(false);
      return;
    }
    // Recording acceptance is best-effort — the workflow already exists.
    await respondToCategoryArchiveSuggestion(categoryId, 'accepted').catch(() => undefined);
    showSuccess(t('settings.categoryWorkflows.created', { category: categoryName }));
    onClose();
  };

  const handleDismiss = async () => {
    setBusy(true);
    // Best-effort — dismissing should always close the prompt even if the
    // network call fails.
    try {
      await respondToCategoryArchiveSuggestion(categoryId, 'dismissed');
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
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
        style={{
          background: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          width: '100%',
          maxWidth: 440,
          boxShadow: theme.shadows.xl,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: theme.spacing.sm, fontSize: theme.typography.fontSize.lg }}>
          {t('inbox.category.autoArchiveSuggestTitle', { category: categoryName })}
        </h3>
        <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('inbox.category.autoArchiveSuggestBody', { category: categoryName })}
        </p>

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
            onClick={handleDismiss}
            disabled={busy}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.default}`,
              background: theme.colors.background.paper,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('inbox.category.autoArchiveSuggestDismiss')}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: 'none',
              background: theme.colors.primary.main,
              color: theme.colors.text.inverse,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {busy ? t('common.saving') : t('inbox.category.autoArchiveSuggestAccept')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestArchiveWorkflowModal;
