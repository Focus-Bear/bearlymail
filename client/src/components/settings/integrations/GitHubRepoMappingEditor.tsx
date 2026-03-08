import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface Props {
  emailCategories: string;
  context: string;
  onChangeCategories: (v: string) => void;
  onChangeContext: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  t: (tKey: string) => string;
}

export const GitHubRepoMappingEditor: React.FC<Props> = ({
  emailCategories,
  context,
  onChangeCategories,
  onChangeContext,
  onSave,
  onCancel,
  t,
}) => {
  return (
    <div style={{ marginTop: theme.spacing.sm }}>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <label
          style={{
            display: 'block',
            marginBottom: theme.spacing.xs,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.github.repoMappings.emailCategories')}
        </label>
        <input
          type="text"
          value={emailCategories}
          onChange={event => onChangeCategories(event.target.value)}
          placeholder={t('settings.github.repoMappings.categoriesPlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <label
          style={{
            display: 'block',
            marginBottom: theme.spacing.xs,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.github.repoMappings.contextLabel')}
        </label>
        <input
          type="text"
          value={context}
          onChange={event => onChangeContext(event.target.value)}
          placeholder={t('settings.github.repoMappings.contextPlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          onClick={onSave}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default GitHubRepoMappingEditor;
