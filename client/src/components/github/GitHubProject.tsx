import React from 'react';
import { theme } from 'theme/theme';
import { EMOJI_CLIPBOARD } from 'constants/emojis';
import { useAuth } from 'contexts/AuthContext';

interface GitHubProjectProps {
  projects?: Array<{
    name: string;
    status?: string;
  }>;
}

export const GitHubProject: React.FC<GitHubProjectProps> = ({ projects }) => {
  const { user } = useAuth();
  
  // Debug logging
  if (projects && projects.length > 0) {
    console.log('[GitHub Projects] Rendering projects:', projects);
  } else {
    console.log('[GitHub Projects] No projects to display:', { projects, length: projects?.length || 0 });
  }
  
  const hasProjects = projects && projects.length > 0;
  
  return (
    <>
      {hasProjects && (
        <div style={{
          marginTop: theme.spacing.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.xs,
        }}>
          {projects.map((project) => (
            <div
              key={`project-${project.name}-${project.status || 'no-status'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                flexWrap: 'wrap',
              }}
            >
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
              }}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
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
      )}
      
      {user?.isAdmin && (
        <div style={{
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          {/* eslint-disable i18next/no-literal-string */}
          <h4 style={{
            marginTop: 0,
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}>
            Debug: Project Data (Admin Only)
          </h4>
          {/* eslint-enable i18next/no-literal-string */}
          <div style={{
            fontFamily: 'monospace',
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.sm,
            maxHeight: '300px',
            overflow: 'auto',
          }}>
            {JSON.stringify({
              projects,
              projectsLength: projects?.length || 0,
              hasProjects: !!hasProjects,
              projectsType: typeof projects,
              projectsIsArray: Array.isArray(projects),
            }, null, 2)}
          </div>
        </div>
      )}
    </>
  );
};



