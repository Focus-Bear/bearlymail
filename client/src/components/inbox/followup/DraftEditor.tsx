import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

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
    <div onClick={event => event.stopPropagation()}>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <RichTextEditor content={editedDraft} onChange={onDraftChange} minHeight="100px" />
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          onClick={event => {
            event.stopPropagation();
            onSave();
          }}
          disabled={isSavingDraft}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: isSavingDraft ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {isSavingDraft ? t('common.saving') : t('common.save')}
        </button>
        <button
          onClick={event => {
            event.stopPropagation();
            onCancel();
          }}
          disabled={isSavingDraft}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
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
