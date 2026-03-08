import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import GitHubRepoMappingRow from './GitHubRepoMappingRow';

const DISABLED_OPACITY = 0.5;

interface RepoMapping {
  id: string;
  owner: string;
  repo: string;
  emailCategories: string | null;
  context: string | null;
  isAutoDiscovered: boolean;
  isDefault: boolean;
}

interface GitHubRepoMappingsSectionProps {
  hasGithubToken: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  color: theme.colors.text.primary,
  fontWeight: theme.typography.fontWeight.medium,
  fontSize: theme.typography.fontSize.sm,
};

export const GitHubRepoMappingsSection: React.FC<GitHubRepoMappingsSectionProps> = ({ hasGithubToken }) => {
  const { t } = useTranslation();
  const [mappings, setMappings] = useState<RepoMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newCategories, setNewCategories] = useState('');
  const [newContext, setNewContext] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState('');
  const [editContext, setEditContext] = useState('');

  const fetchMappings = useCallback(async () => {
    if (!hasGithubToken) {
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/github/repo-mappings`);
      setMappings(response.data);
    } catch (error) {
      console.error('Error fetching repo mappings:', error);
    } finally {
      setLoading(false);
    }
  }, [hasGithubToken]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newOwner.trim() || !newRepo.trim()) {
      return;
    }
    try {
      await axios.post(`${API_URL}/github/repo-mappings`, {
        owner: newOwner.trim(),
        repo: newRepo.trim(),
        emailCategories: newCategories.trim() || undefined,
        context: newContext.trim() || undefined,
        isDefault: mappings.length === 0,
      });
      setNewOwner('');
      setNewRepo('');
      setNewCategories('');
      setNewContext('');
      setShowAddForm(false);
      await fetchMappings();
    } catch (error) {
      console.error('Error adding repo mapping:', error);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await axios.put(`${API_URL}/github/repo-mappings/${id}`, {
        emailCategories: editCategories.trim() || undefined,
        context: editContext.trim() || undefined,
      });
      setEditingId(null);
      await fetchMappings();
    } catch (error) {
      console.error('Error updating repo mapping:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('settings.github.repoMappings.confirmDelete'))) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/github/repo-mappings/${id}`);
      await fetchMappings();
    } catch (error) {
      console.error('Error deleting repo mapping:', error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await axios.put(`${API_URL}/github/repo-mappings/${id}`, { isDefault: true });
      await fetchMappings();
    } catch (error) {
      console.error('Error setting default repo:', error);
    }
  };

  const startEditing = (mapping: RepoMapping) => {
    setEditingId(mapping.id);
    setEditCategories(mapping.emailCategories || '');
    setEditContext(mapping.context || '');
  };

  const AddRepoForm: React.FC = () => (
    <form
      onSubmit={handleAdd}
      style={{
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
      }}
    >
      <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('github.repositoryOwner')} *</label>
          <input
            type="text"
            value={newOwner}
            onChange={event => setNewOwner(event.target.value)}
            placeholder={t('github.repositoryOwnerPlaceholder')}
            required
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('github.repositoryName')} *</label>
          <input
            type="text"
            value={newRepo}
            onChange={event => setNewRepo(event.target.value)}
            placeholder={t('github.repositoryNamePlaceholder')}
            required
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <label style={labelStyle}>{t('settings.github.repoMappings.emailCategories')}</label>
        <input
          type="text"
          value={newCategories}
          onChange={event => setNewCategories(event.target.value)}
          placeholder={t('settings.github.repoMappings.categoriesPlaceholder')}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <label style={labelStyle}>{t('settings.github.repoMappings.contextLabel')}</label>
        <input
          type="text"
          value={newContext}
          onChange={event => setNewContext(event.target.value)}
          placeholder={t('settings.github.repoMappings.contextPlaceholder')}
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          type="submit"
          disabled={!newOwner.trim() || !newRepo.trim()}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            opacity: !newOwner.trim() || !newRepo.trim() ? DISABLED_OPACITY : 1,
          }}
        >
          {t('settings.github.repoMappings.addRepo')}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(false);
            setNewOwner('');
            setNewRepo('');
            setNewCategories('');
            setNewContext('');
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );

  if (!hasGithubToken) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <h2
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontSize: theme.typography.fontSize.xl,
        }}
      >
        {t('settings.github.repoMappings.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.github.repoMappings.description')}
      </p>

      {loading && (
        <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
          {t('common.loading')}
        </p>
      )}

      {!loading && mappings.length === 0 && (
        <p
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.sm,
            fontStyle: 'italic',
            marginBottom: theme.spacing.md,
          }}
        >
          {t('settings.github.repoMappings.noMappings')}
        </p>
      )}

      {mappings.map(mapping => (
        <GitHubRepoMappingRow
          key={mapping.id}
          mapping={mapping}
          isEditing={editingId === mapping.id}
          editCategories={editCategories}
          editContext={editContext}
          onStartEdit={startEditing}
          onSetDefault={handleSetDefault}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onCancel={() => setEditingId(null)}
          setEditCategories={setEditCategories}
          setEditContext={setEditContext}
          t={t}
        />
      ))}

      {showAddForm ? (
        <AddRepoForm />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px dashed ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            width: '100%',
            marginTop: theme.spacing.sm,
          }}
        >
          {t('settings.github.repoMappings.addRepo')}
        </button>
      )}
    </div>
  );
};
