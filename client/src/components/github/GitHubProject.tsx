import React, { useState } from 'react';
import { FiEdit2 } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { GitHubUpdateStatusModal } from 'components/quick-actions/modals/GitHubUpdateStatusModal';
import { EMOJI_CLIPBOARD } from 'constants/emojis';

interface IssueInfo {
  owner: string;
  repo: string;
  number: number;
}

interface GitHubProjectProps {
  projects?: Array<{
    name: string;
    status?: string;
  }>;
  /** When provided, a pencil icon is shown next to each project status to allow editing. */
  issueInfo?: IssueInfo;
  /** Called after a project status is updated successfully so the parent can refresh. */
  onRefresh?: () => void;
}

export const GitHubProject: React.FC<GitHubProjectProps> = ({ projects, issueInfo, onRefresh }) => {
  const [editingProject, setEditingProject] = useState<string | null>(null);

  if (!projects || projects.length === 0) {
    return null;
  }

  return (
    <>
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
            {issueInfo && (
              <button
                onClick={() => setEditingProject(project.name)}
                title="Edit project status"
                aria-label="Edit project status"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  color: theme.colors.text.secondary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: 0.6,
                  lineHeight: 1,
                }}
              >
                <FiEdit2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {editingProject !== null && issueInfo && (
        <GitHubUpdateStatusModal
          issueInfo={issueInfo}
          onClose={() => setEditingProject(null)}
          onSuccess={() => {
            setEditingProject(null);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
};
