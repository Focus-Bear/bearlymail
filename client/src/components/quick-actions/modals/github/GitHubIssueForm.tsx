import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface GitHubIssueFormProps {
  owner: string;
  repo: string;
  title: string;
  description: string;
  labels: string;
  onOwnerChange: (value: string) => void;
  onRepoChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLabelsChange: (value: string) => void;
}

const inputStyle = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
};

const labelStyle = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  color: theme.colors.text.primary,
  fontWeight: theme.typography.fontWeight.medium,
};

export const GitHubIssueForm: React.FC<GitHubIssueFormProps> = ({
  owner,
  repo,
  title,
  description,
  labels,
  onOwnerChange,
  onRepoChange,
  onTitleChange,
  onDescriptionChange,
  onLabelsChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('github.repositoryOwner')} *</label>
        <input
          type="text"
          value={owner}
          onChange={event => onOwnerChange(event.target.value)}
          placeholder={t('github.repositoryOwnerPlaceholder')}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('github.repositoryName')} *</label>
        <input
          type="text"
          value={repo}
          onChange={event => onRepoChange(event.target.value)}
          placeholder={t('github.repositoryNamePlaceholder')}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('github.issueTitle')} *</label>
        <input
          type="text"
          value={title}
          onChange={event => onTitleChange(event.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('github.issueDescription')}</label>
        <textarea
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          rows={8}
          style={{
            ...inputStyle,
            fontFamily: theme.typography.fontFamily,
            resize: 'vertical',
          }}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.lg }}>
        <label style={labelStyle}>{t('github.labels')}</label>
        <input
          type="text"
          value={labels}
          onChange={event => onLabelsChange(event.target.value)}
          placeholder={t('github.labelsPlaceholder')}
          style={inputStyle}
        />
      </div>
    </>
  );
};
