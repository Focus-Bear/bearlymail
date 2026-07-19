import React from 'react';
import { theme } from 'theme/theme';

import { MERGE_TAGS } from 'components/settings/auto-responder/utils/templateUtils';
import { COLOR_TRANSPARENT, COLOR_WHITE } from 'constants/colors';
import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';

interface Props {
  isEditing: boolean;
  isSaving: boolean;
  showMergeTags: boolean;
  setShowMergeTags: (v: boolean) => void;
  onEditClick: () => void;
  onSaveClick: () => void;
  onCancelClick: () => void;
  t: (k: string) => string;
}

interface MergeTagsPanelProps {
  t: (k: string) => string;
}

const MergeTagsPanel: React.FC<MergeTagsPanelProps> = ({ t }) => (
  <div
    style={{
      position: 'absolute',
      left: 20,
      right: 20,
      top: '100%',
      marginTop: theme.spacing.sm,
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.sm,
      padding: theme.spacing.sm,
      zIndex: 20,
    }}
  >
    <p style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary, marginBottom: theme.spacing.xs }}>
      {t('settings.autoResponder.templates.mergeTagsHelp')}
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
      {MERGE_TAGS.map(item => (
        <button
          key={item.tag}
          onClick={() => {
            const ev = new CustomEvent('insert-merge-tag', { detail: item.tag });
            window.dispatchEvent(ev);
          }}
          title={item.description}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.greyscale[300],
            color: theme.colors.text.primary,
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontFamily: 'monospace',
            ...theme.typography.body.small,
          }}
        >
          {item.tag}
        </button>
      ))}
    </div>
  </div>
);

interface ToolbarEditButtonsProps {
  isSaving: boolean;
  onSaveClick: () => void;
  onCancelClick: () => void;
  t: (k: string) => string;
}

const ToolbarEditButtons: React.FC<ToolbarEditButtonsProps> = ({ isSaving, onSaveClick, onCancelClick, t }) => (
  <>
    <button
      onClick={onSaveClick}
      disabled={isSaving}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_WHITE,
        border: 'none',
        borderRadius: theme.borderRadius.sm,
        cursor: isSaving ? 'not-allowed' : 'pointer',
        opacity: isSaving ? OPACITY_HALF : OPACITY_FULL,
        ...theme.typography.body.medium,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {isSaving ? t('common.saving') : t('common.save')}
    </button>
    <button
      onClick={onCancelClick}
      disabled={isSaving}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: COLOR_TRANSPARENT,
        color: theme.colors.text.secondary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.sm,
        cursor: 'pointer',
        ...theme.typography.body.medium,
      }}
    >
      {t('common.cancel')}
    </button>
  </>
);

const TemplateEditorToolbar: React.FC<Props> = ({
  isEditing,
  isSaving,
  showMergeTags,
  setShowMergeTags,
  onEditClick,
  onSaveClick,
  onCancelClick,
  t,
}) => {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm }}
    >
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {!isEditing ? (
          <button
            onClick={onEditClick}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: theme.colors.background.paper,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              ...theme.typography.body.medium,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {t('settings.autoResponder.templates.edit')}
          </button>
        ) : (
          <ToolbarEditButtons isSaving={isSaving} onSaveClick={onSaveClick} onCancelClick={onCancelClick} t={t} />
        )}
      </div>

      {isEditing && (
        <button
          onClick={() => setShowMergeTags(!showMergeTags)}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: showMergeTags ? theme.colors.primary.light : COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            ...theme.typography.body.small,
          }}
        >
          {t('settings.autoResponder.templates.mergeTags')}
        </button>
      )}

      {isEditing && showMergeTags && <MergeTagsPanel t={t} />}
    </div>
  );
};

export default TemplateEditorToolbar;
