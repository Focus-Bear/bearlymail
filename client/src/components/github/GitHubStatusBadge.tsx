import React from 'react';
import { theme } from '../../theme/theme';
import { GitHubLink } from '../../types/email';

interface GitHubStatusBadgeProps {
  link: GitHubLink;
}

export const GitHubStatusBadge: React.FC<GitHubStatusBadgeProps> = ({ link }) => {
  const status = link.status;
  if (!status) return null;

  // Determine status color and icon
  let statusColor = theme.colors.text.secondary;
  let statusIcon = '🔗';
  let statusText = '';

  if (link.type === 'issue') {
    if (status.state === 'open') {
      statusColor = theme.colors.accent.success || '#10b981';
      statusIcon = '🟢';
      statusText = 'Open';
    } else {
      statusColor = theme.colors.text.tertiary;
      statusIcon = '⚪';
      statusText = 'Closed';
    }
  } else if (link.type === 'pr') {
    if (status.merged) {
      statusColor = theme.colors.primary.main;
      statusIcon = '🟣';
      statusText = 'Merged';
    } else if (status.state === 'open') {
      if (status.reviewStatus === 'approved') {
        statusColor = theme.colors.accent.success || '#10b981';
        statusIcon = '✅';
        statusText = 'Approved';
      } else if (status.reviewStatus === 'changes_requested') {
        statusColor = theme.colors.accent.warning || '#f59e0b';
        statusIcon = '⚠️';
        statusText = 'Changes';
      } else {
        statusColor = theme.colors.accent.info || '#3b82f6';
        statusIcon = '🔵';
        statusText = 'Open';
      }
    } else {
      statusColor = theme.colors.text.tertiary;
      statusIcon = '⚪';
      statusText = 'Closed';
    }
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: theme.typography.fontSize.xs,
        padding: `2px ${theme.spacing.sm}`,
        backgroundColor: theme.colors.background.subtle,
        color: statusColor,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${statusColor}40`,
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        fontWeight: theme.typography.fontWeight.medium,
      }}
      title={`${link.type === 'issue' ? 'Issue' : 'PR'} #${link.number} - ${status.title || ''}`}
    >
      <span>{statusIcon}</span>
      <span>{link.owner}/{link.repo}#{link.number}</span>
      {statusText && <span style={{ opacity: 0.8 }}>{statusText}</span>}
    </a>
  );
};



