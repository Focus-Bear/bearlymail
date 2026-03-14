import React from 'react';
import { theme } from 'theme/theme';

import { EMOJI_CLIPBOARD } from 'constants/emojis';

interface GitHubProjectProps {
  projects?: Array<{
    name: string;
    status?: string;
  }>;
}

export const GitHubProject: React.FC<GitHubProjectProps> = ({ projects }) => {
  if (!projects || projects.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs,
      }}
    >
      {projects.map(project => (
        <div
          key={`project-${project.name}-${project.status || 'no-status'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
          >
            {EMOJI_CLIPBOARD} {project.name}
          </div>
          {project.status && (
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                padding: `2px ${theme.spacing.sm}`,
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.secondary,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.light}`,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {project.status}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
