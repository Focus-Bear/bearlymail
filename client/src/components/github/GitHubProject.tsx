import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEdit2, FiMessageSquare } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { GitHubAddCommentModal } from 'components/quick-actions/modals/GitHubAddCommentModal';
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
  /** When provided, pencil and comment icons are shown next to each project status. */
  issueInfo?: IssueInfo;
  /** Called after a project status is updated successfully so the parent can refresh. */
  onRefresh?: () => void;
  /** Email body used to pre-fill the add-comment modal. */
  emailBody?: string;
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
  color: theme.colors.text.secondary,
  display: 'inline-flex',
  alignItems: 'center',
  opacity: 0.6,
  lineHeight: 1,
};

export const GitHubProject: React.FC<GitHubProjectProps> = ({ projects, issueInfo, onRefresh, emailBody }) => {
  const { t } = useTranslation();
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [commentingProject, setCommentingProject] = useState<string | null>(null);

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
              <>
                <button
                  onClick={() => setEditingProject(project.name)}
                  title={t('github.editProjectStatus')}
                  aria-label={t('github.editProjectStatus')}
                  style={iconButtonStyle}
                >
                  <FiEdit2 size={11} />
                </button>
                <button
                  onClick={() => setCommentingProject(project.name)}
                  title={t('github.addComment')}
                  aria-label={t('github.addComment')}
                  style={iconButtonStyle}
                >
                  <FiMessageSquare size={11} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {editingProject !== null && issueInfo && (
        <GitHubUpdateStatusModal
          issueInfo={issueInfo}
          projectName={editingProject ?? undefined}
          onClose={() => setEditingProject(null)}
          onSuccess={() => {
            setEditingProject(null);
            onRefresh?.();
          }}
        />
      )}

      {commentingProject !== null && issueInfo && (
        <GitHubAddCommentModal
          issueInfo={issueInfo}
          email={{ body: emailBody ?? '' }}
          onClose={() => setCommentingProject(null)}
          onSuccess={() => {
            setCommentingProject(null);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
};
