import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface Assignee {
  login: string;
  avatar_url: string;
}

interface GitHubAssigneesProps {
  assignees: Assignee[];
}

export const GitHubAssignees: React.FC<GitHubAssigneesProps> = ({ assignees }) => {
  const { t } = useTranslation();
  if (!assignees || assignees.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
      <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
        {t('github.assignedTo')}:
      </span>
      {assignees.map(assignee => (
        <a
          key={`assignee-${assignee.login}-${assignee.avatar_url}`}
          href={`https://github.com/${assignee.login}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            textDecoration: 'none',
          }}
        >
          <img
            src={assignee.avatar_url}
            alt={assignee.login}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
            }}
          />
          <span
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.primary.main,
            }}
          >
            {assignee.login}
          </span>
        </a>
      ))}
    </div>
  );
};
