import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';

import GitHubRepoMappingEditor from './GitHubRepoMappingEditor';

interface RepoMapping {
  id: string;
  owner: string;
  repo: string;
  emailCategories: string | null;
  context: string | null;
  isAutoDiscovered: boolean;
  isDefault: boolean;
}

interface Props {
  mapping: RepoMapping;
  isEditing: boolean;
  editCategories: string;
  editContext: string;
  onStartEdit: (m: RepoMapping) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string) => void;
  onCancel: () => void;
  setEditCategories: (v: string) => void;
  setEditContext: (v: string) => void;
  t: (k: string) => string;
}

const RepoHeader: React.FC<{
  mapping: RepoMapping;
  t: (k: string) => string;
  onSetDefault: (id: string) => void;
  onStartEdit: (m: RepoMapping) => void;
  onDelete: (id: string) => void;
}> = ({ mapping, t, onSetDefault, onStartEdit, onDelete }) => (
  <div
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xs }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
      <span
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.base,
        }}
      >
        {mapping.owner}/{mapping.repo}
      </span>
      {mapping.isDefault && (
        <span
          style={{
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            padding: `2px ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('settings.github.repoMappings.default')}
        </span>
      )}
      {mapping.isAutoDiscovered && (
        <span
          style={{
            backgroundColor: `${theme.colors.accent.info}20`,
            color: theme.colors.accent.info,
            padding: `2px ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {t('settings.github.repoMappings.autoDiscovered')}
        </span>
      )}
    </div>
    <div style={{ display: 'flex', gap: theme.spacing.xs }}>
      {!mapping.isDefault && (
        <button
          onClick={() => onSetDefault(mapping.id)}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: COLOR_TRANSPARENT,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
          }}
        >
          {t('settings.github.repoMappings.setDefault')}
        </button>
      )}
      <button
        onClick={() => onStartEdit(mapping)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: COLOR_TRANSPARENT,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
        }}
      >
        {t('common.edit')}
      </button>
      <button
        onClick={() => onDelete(mapping.id)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.accent.error}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: COLOR_TRANSPARENT,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.accent.error,
        }}
      >
        {t('common.delete')}
      </button>
    </div>
  </div>
);

const RepoDetails: React.FC<{ mapping: RepoMapping; t: (k: string) => string }> = ({ mapping, t }) => (
  <>
    {mapping.emailCategories && (
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          margin: `${theme.spacing.xs} 0 0 0`,
        }}
      >
        {t('settings.github.repoMappings.emailCategories')}: {mapping.emailCategories}
      </p>
    )}
    {mapping.context && (
      <p
        style={{
          color: theme.colors.text.tertiary,
          fontSize: theme.typography.fontSize.xs,
          margin: `${theme.spacing.xs} 0 0 0`,
          fontStyle: 'italic',
        }}
      >
        {mapping.context}
      </p>
    )}
  </>
);

export const GitHubRepoMappingRow: React.FC<Props> = ({
  mapping,
  isEditing,
  editCategories,
  editContext,
  onStartEdit,
  onSetDefault,
  onDelete,
  onUpdate,
  onCancel,
  setEditCategories,
  setEditContext,
  t,
}) => {
  return (
    <div
      key={mapping.id}
      style={{
        border: `1px solid ${mapping.isDefault ? theme.colors.primary.main : theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        backgroundColor: mapping.isDefault ? `${theme.colors.primary.main}08` : 'transparent',
      }}
    >
      <RepoHeader mapping={mapping} t={t} onSetDefault={onSetDefault} onStartEdit={onStartEdit} onDelete={onDelete} />

      {isEditing ? (
        <GitHubRepoMappingEditor
          emailCategories={editCategories}
          context={editContext}
          onChangeCategories={setEditCategories}
          onChangeContext={setEditContext}
          onSave={() => onUpdate(mapping.id)}
          onCancel={() => onCancel()}
          t={t}
        />
      ) : (
        <RepoDetails mapping={mapping} t={t} />
      )}
    </div>
  );
};

export default GitHubRepoMappingRow;
