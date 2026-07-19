import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { Z_INDEX_POPUP } from 'constants/numbers';
import { useNotifications } from 'contexts/NotificationContext';
import { useProtoCategories } from 'hooks/useProtoCategories';

import { ProtoCategoriesModalHeader } from './ProtoCategoriesModalHeader';
import { ProtoCategoryList, ProtoCategoryListProps } from './ProtoCategoryList';

interface ProtoCategoriesModalProps {
  onClose: () => void;
}

interface ProtoCategoriesModalContentProps extends ProtoCategoryListProps {
  onClose: () => void;
}

const ProtoCategoriesModalContent: React.FC<ProtoCategoriesModalContentProps> = ({ onClose, ...listProps }) => (
  <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.overlay.darkLight,
        zIndex: 1999,
      }}
    />
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: Z_INDEX_POPUP,
      }}
    >
      <ProtoCategoriesModalHeader onClose={onClose} />
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <ProtoCategoryList {...listProps} />
      </div>
    </div>
  </>
);

export const ProtoCategoriesModal: React.FC<ProtoCategoriesModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotifications();
  const {
    categories,
    isLoading,
    promotingId,
    deletingId,
    savingNameId,
    draftNames,
    handlePromote,
    handleNameChange,
    handleSaveName,
    handleDelete,
  } = useProtoCategories(showSuccess, showError, t);

  return (
    <ProtoCategoriesModalContent
      onClose={onClose}
      categories={categories}
      isLoading={isLoading}
      promotingId={promotingId}
      deletingId={deletingId}
      savingNameId={savingNameId}
      draftNames={draftNames}
      onNameChange={handleNameChange}
      onSaveName={handleSaveName}
      onPromote={handlePromote}
      onDelete={handleDelete}
    />
  );
};
