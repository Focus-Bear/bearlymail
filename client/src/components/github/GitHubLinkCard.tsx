import React from 'react';
import { theme } from '../../theme/theme';
import { GitHubLink } from '../../types/email';

interface GitHubLinkCardProps {
  link: GitHubLink;
}

export const GitHubLinkCard: React.FC<GitHubLinkCardProps> = ({ link }) => {
  const status = link.status;
  
  if (!status) {
    return (
      <div style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: theme.colors.primary.main,
              textDecoration: 'none',
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.base,
            }}
          >
            {link.type === 'issue' ? '🔵' : '🟣'} {link.owner}/{link.repo}#{link.number}
          </a>
        </div>
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          Status not available
        </div>
      </div>
    );
  }

  const isIssue = link.type === 'issue';
  const isOpen = status.state === 'open';
  const isMerged = status.merged || status.state === 'merged';
  const isClosed = !isOpen && !isMerged;

  return (
    <div style={{
      padding: theme.spacing.md,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
        <div style={{ flex: 1 }}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: theme.colors.primary.main,
              textDecoration: 'none',
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.base,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              marginBottom: theme.spacing.xs,
            }}
          >
            {isIssue ? '🔵' : '🟣'} {link.owner}/{link.repo}#{link.number}
            <span style={{ fontSize: theme.typography.fontSize.xs, opacity: 0.7 }}>
              ({isIssue ? 'Issue' : 'PR'})
            </span>
          </a>
          {status.title && (
            <div style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.xs,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              {status.title}
            </div>
          )}
        </div>
        <div style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: isOpen ? (theme.colors.accent.success || '#10b981') : 
                         isMerged ? theme.colors.primary.main :
                         theme.colors.text.tertiary,
          color: 'white',
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          textTransform: 'uppercase',
        }}>
          {isMerged ? 'Merged' : isOpen ? 'Open' : 'Closed'}
        </div>
      </div>

      {/* PR-specific status */}
      {!isIssue && (
        <div style={{ marginBottom: theme.spacing.sm }}>
          {status.reviewStatus === 'approved' && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: (theme.colors.accent.success || '#10b981') + '20',
              color: theme.colors.accent.success || '#10b981',
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
              fontWeight: theme.typography.fontWeight.medium,
              marginRight: theme.spacing.xs,
            }}>
              ✅ Approved
            </div>
          )}
          {status.reviewStatus === 'changes_requested' && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: (theme.colors.accent.warning || '#f59e0b') + '20',
              color: theme.colors.accent.warning || '#f59e0b',
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
              fontWeight: theme.typography.fontWeight.medium,
              marginRight: theme.spacing.xs,
            }}>
              ⚠️ Changes Requested
            </div>
          )}
          {status.commentsCount !== undefined && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.background.paper,
              color: theme.colors.text.secondary,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
              marginRight: theme.spacing.xs,
            }}>
              💬 {status.commentsCount} comment{status.commentsCount !== 1 ? 's' : ''}
            </div>
          )}
          {status.mergeable !== null && status.mergeable && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: (theme.colors.accent.success || '#10b981') + '20',
              color: theme.colors.accent.success || '#10b981',
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
            }}>
              ✓ Ready to merge
            </div>
          )}
        </div>
      )}

      {/* Labels */}
      {status.labels && status.labels.length > 0 && (
        <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap', marginBottom: theme.spacing.sm }}>
          {status.labels.map((label, labelIdx) => (
            <span
              key={labelIdx}
              style={{
                fontSize: theme.typography.fontSize.xs,
                padding: `2px ${theme.spacing.sm}`,
                backgroundColor: `#${label.color || '000000'}20`,
                color: `#${label.color || '000000'}`,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid #${label.color || '000000'}40`,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Assignees */}
      {status.assignees && status.assignees.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
            Assigned to:
          </span>
          {status.assignees.map((assignee, assigneeIdx) => (
            <a
              key={assigneeIdx}
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
              <span style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.primary.main,
              }}>
                {assignee.login}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Project */}
      {status.project && (
        <div style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          marginTop: theme.spacing.xs,
        }}>
          📋 Project: {status.project}
        </div>
      )}
    </div>
  );
};



