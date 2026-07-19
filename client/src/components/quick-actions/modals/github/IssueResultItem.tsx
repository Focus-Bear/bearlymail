import React from 'react';
import { theme } from 'theme/theme';

interface IssueResult {
  url: string;
  title: string;
  repository: string;
  number: number;
  state: string;
  body?: string;
}

interface IssueResultItemProps {
  issue: IssueResult;
}

export const IssueResultItem: React.FC<IssueResultItemProps> = ({ issue }) => {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        textDecoration: 'none',
        color: theme.colors.text.primary,
        display: 'block',
        transition: theme.transitions.fast,
      }}
      onMouseEnter={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
        event.currentTarget.style.borderColor = theme.colors.primary.main;
      }}
      onMouseLeave={event => {
        event.currentTarget.style.backgroundColor = theme.colors.background.default;
        event.currentTarget.style.borderColor = theme.colors.border.medium;
      }}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.xs,
        }}
      >
        {issue.title}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {issue.repository} #{issue.number} · {issue.state}
      </div>
      {issue.body && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginTop: theme.spacing.xs,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {issue.body}
        </div>
      )}
    </a>
  );
};
