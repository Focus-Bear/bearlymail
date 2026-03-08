import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED } from 'constants/numbers';
import { PROTO_CATEGORY_PROMOTION_THRESHOLD, ProtoCategory } from 'hooks/useProtoCategories';

interface ProtoCategoryProgressBarProps {
  emailCount: number;
  progress: number;
}

const ProtoCategoryProgressBar: React.FC<ProtoCategoryProgressBarProps> = ({ emailCount, progress }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
    <div
      style={{
        flex: 1,
        height: '4px',
        backgroundColor: theme.colors.border.light,
        borderRadius: theme.borderRadius.full,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${(progress / PROTO_CATEGORY_PROMOTION_THRESHOLD) * 100}%`,
          height: '100%',
          backgroundColor: theme.colors.primary.main,
        }}
      />
    </div>
    <span
      style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.secondary,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >{`${emailCount} / ${PROTO_CATEGORY_PROMOTION_THRESHOLD}`}</span>
  </div>
);

interface ProtoCategoryActionButtonsProps {
  categoryId: string;
  isBusy: boolean;
  isPromoting: boolean;
  isDeleting: boolean;
  isSavingName: boolean;
  hasNameChanged: boolean;
  onSaveName: (id: string) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}

const ProtoCategoryActionButtons: React.FC<ProtoCategoryActionButtonsProps> = ({
  categoryId,
  isBusy,
  isPromoting,
  isDeleting,
  isSavingName,
  hasNameChanged,
  onSaveName,
  onPromote,
  onDelete,
}) => {
  const { t } = useTranslation();
  const saveDisabled = isSavingName || !hasNameChanged || isBusy;
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
      <button
        onClick={() => onSaveName(categoryId)}
        disabled={saveDisabled}
        style={{
          background: 'transparent',
          border: `1px solid ${theme.colors.border.medium}`,
          color: theme.colors.text.primary,
          cursor: saveDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          opacity: saveDisabled ? OPACITY_DISABLED : 1,
        }}
      >
        {isSavingName ? t('settings.protoCategories.savingName') : t('settings.protoCategories.saveName')}
      </button>
      <button
        onClick={() => onPromote(categoryId)}
        disabled={isBusy}
        style={{
          background: 'transparent',
          border: `1px solid ${theme.colors.primary.main}`,
          color: theme.colors.primary.main,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          opacity: isBusy ? OPACITY_DISABLED : 1,
        }}
      >
        {isPromoting ? t('settings.protoCategories.promoting') : t('settings.protoCategories.promote')}
      </button>
      <button
        onClick={() => onDelete(categoryId)}
        disabled={isBusy}
        style={{
          background: 'transparent',
          border: `1px solid ${theme.colors.accent.error}`,
          color: theme.colors.accent.error,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          opacity: isBusy ? OPACITY_DISABLED : 1,
        }}
      >
        {isDeleting ? t('settings.protoCategories.deleting') : t('settings.protoCategories.delete')}
      </button>
    </div>
  );
};

export interface ProtoCategoryRowProps {
  category: ProtoCategory;
  draftName: string;
  hasNameChanged: boolean;
  progress: number;
  isBusy: boolean;
  isPromoting: boolean;
  isDeleting: boolean;
  isSavingName: boolean;
  onNameChange: (id: string, value: string) => void;
  onSaveName: (id: string) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProtoCategoryRow: React.FC<ProtoCategoryRowProps> = ({
  category,
  draftName,
  hasNameChanged,
  progress,
  isBusy,
  isPromoting,
  isDeleting,
  isSavingName,
  onNameChange,
  onSaveName,
  onPromote,
  onDelete,
}) => (
  <div
    style={{
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.background.subtle,
      opacity: isBusy ? OPACITY_DISABLED : 1,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          type="text"
          value={draftName}
          onChange={event => onNameChange(category.id, event.target.value)}
          disabled={isSavingName}
          style={{
            width: '100%',
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.background.paper,
          }}
          aria-label={category.name}
        />
        {category.description && (
          <div
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xs,
            }}
          >
            {category.description}
          </div>
        )}
        <ProtoCategoryProgressBar emailCount={category.emailCount} progress={progress} />
      </div>
      <ProtoCategoryActionButtons
        categoryId={category.id}
        isBusy={isBusy}
        isPromoting={isPromoting}
        isDeleting={isDeleting}
        isSavingName={isSavingName}
        hasNameChanged={hasNameChanged}
        onSaveName={onSaveName}
        onPromote={onPromote}
        onDelete={onDelete}
      />
    </div>
  </div>
);
