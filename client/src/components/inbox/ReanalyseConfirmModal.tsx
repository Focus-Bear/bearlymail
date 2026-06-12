import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ConfirmModal } from 'components/ConfirmModal';

interface ReanalyseConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms the full-inbox recategorisation triggered from the "Other" category header.
 * The button lives on the Other accordion but the action re-sorts ALL inbox categories,
 * so the dialog spells out the real scope before anything starts.
 */
export const ReanalyseConfirmModal: React.FC<ReanalyseConfirmModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      isOpen={isOpen}
      title={t('inbox.category.reanalyseConfirmTitle')}
      message={t('inbox.category.reanalyseConfirmMessage')}
      confirmLabel={t('inbox.category.reanalyseConfirmCta')}
      cancelLabel={t('common.cancel')}
      icon="🔄"
      confirmColor={theme.colors.primary.main}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};
