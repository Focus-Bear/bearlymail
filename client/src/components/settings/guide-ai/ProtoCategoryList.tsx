import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PROTO_CATEGORY_PROMOTION_THRESHOLD, ProtoCategory } from 'hooks/useProtoCategories';

import { ProtoCategoryRow } from './ProtoCategoryRow';

export interface ProtoCategoryListProps {
  categories: ProtoCategory[];
  isLoading: boolean;
  promotingId: string | null;
  deletingId: string | null;
  savingNameId: string | null;
  draftNames: Record<string, string>;
  onNameChange: (id: string, value: string) => void;
  onSaveName: (id: string) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProtoCategoryList: React.FC<ProtoCategoryListProps> = ({
  categories,
  isLoading,
  promotingId,
  deletingId,
  savingNameId,
  draftNames,
  onNameChange,
  onSaveName,
  onPromote,
  onDelete,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.loading')}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div
        style={{
          padding: theme.spacing.lg,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.protoCategories.empty')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {categories.map(category => {
        const isPromoting = promotingId === category.id;
        const isDeleting = deletingId === category.id;
        const isSavingName = savingNameId === category.id;
        const isBusy = isPromoting || isDeleting;
        const progress = Math.min(category.emailCount, PROTO_CATEGORY_PROMOTION_THRESHOLD);
        const draftName = draftNames[category.id] ?? category.name;
        const hasNameChanged = draftName.trim() !== category.name;

        return (
          <ProtoCategoryRow
            key={category.id}
            category={category}
            draftName={draftName}
            hasNameChanged={hasNameChanged}
            progress={progress}
            isBusy={isBusy}
            isPromoting={isPromoting}
            isDeleting={isDeleting}
            isSavingName={isSavingName}
            onNameChange={onNameChange}
            onSaveName={onSaveName}
            onPromote={onPromote}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
};
