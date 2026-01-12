import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface DraftEditorProps {
  editedDraft: string;
  isSavingDraft: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const DraftEditor: React.FC<DraftEditorProps> = ({
  editedDraft,
  isSavingDraft,
  onDraftChange,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  
  return (
    <div>
      <textarea
        value={editedDraft}
        onChange={(e) => onDraftChange(e.target.value)}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
          fontFamily: 'inherit',
          resize: 'vertical',
          marginBottom: theme.spacing.sm,
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={isSavingDraft}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: isSavingDraft ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {isSavingDraft ? t('common.saving') : t('common.save')}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          disabled={isSavingDraft}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: 'transparent',
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            cursor: isSavingDraft ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};
