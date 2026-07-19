import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface DraftEditorProps {
  editedDraft: string;
  isSavingDraft: boolean;
  isSendingDraft?: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onSaveAndSend?: () => void;
  onCancel: () => void;
}

export const DraftEditor: React.FC<DraftEditorProps> = ({
  editedDraft,
  isSavingDraft,
  isSendingDraft = false,
  onDraftChange,
  onSave,
  onSaveAndSend,
  onCancel,
}) => {
  const { t } = useTranslation();
  const isBusy = isSavingDraft || isSendingDraft;

  return (
    <div onClick={event => event.stopPropagation()}>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <RichTextEditor content={editedDraft} onChange={onDraftChange} minHeight="100px" />
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <button
          onClick={event => {
            event.stopPropagation();
            onSave();
          }}
          disabled={isBusy}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: isBusy ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {isSavingDraft ? t('common.saving') : t('common.save')}
        </button>
        {onSaveAndSend && (
          <button
            onClick={event => {
              event.stopPropagation();
              onSaveAndSend();
            }}
            disabled={isBusy}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.success.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              cursor: isBusy ? 'wait' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {isSendingDraft ? t('inbox.sending') : t('common.saveAndSend')}
          </button>
        )}
        <button
          onClick={event => {
            event.stopPropagation();
            onCancel();
          }}
          disabled={isBusy}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            cursor: isBusy ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};
