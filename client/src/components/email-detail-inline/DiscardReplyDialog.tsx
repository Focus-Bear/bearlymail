import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ConfirmModal } from 'components/ConfirmModal';
import { EMOJI_TRASH } from 'constants/emojis';

interface DiscardReplyDialogProps {
  isOpen: boolean;
  onKeepEditing: () => void;
  /** Omitted when the host can't save drafts, which hides the "Save draft" button. */
  onSaveDraft?: () => void;
  onDiscard: () => void;
}

/**
 * "Discard this draft?" — asked when a reply with unsent changes is closed.
 * Portalled to <body>: the composer's fade-in animation would otherwise trap
 * the fixed-position overlay inside the composer.
 */
export const DiscardReplyDialog: React.FC<DiscardReplyDialogProps> = ({
  isOpen,
  onKeepEditing,
  onSaveDraft,
  onDiscard,
}) => {
  const { t } = useTranslation();
  return createPortal(
    <ConfirmModal
      isOpen={isOpen}
      title={t('emailDetail.discardReplyTitle')}
      message={t('emailDetail.discardReplyMessage')}
      cancelLabel={t('emailDetail.discardReplyKeepEditing')}
      secondaryLabel={onSaveDraft ? t('emailDetail.discardReplySaveDraft') : undefined}
      onSecondary={onSaveDraft}
      confirmLabel={t('emailDetail.discardReplyDiscard')}
      icon={EMOJI_TRASH}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
    />,
    document.body
  );
};
