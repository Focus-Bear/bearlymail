import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { COLOR_NAMED_WHITE } from 'constants/colors';

interface GitHubLinkHeaderProps {
  link: GitHubLink;
  status: {
    state: string;
    title?: string;
    merged?: boolean;
  };
  isIssue: boolean;
  isOpen: boolean;
  isMerged: boolean;
}

export const GitHubLinkHeader: React.FC<GitHubLinkHeaderProps> = ({ link, status, isIssue, isOpen, isMerged }) => {
  const { t } = useTranslation();
  const getStatusBadgeColor = (): string => {
    if (isOpen) {
      return theme.colors.accent.success || '#10b981';
    }
    if (isMerged) {
      return theme.colors.primary.main;
    }
    return theme.colors.text.tertiary;
  };

  const getStatusText = (): string => {
    if (isMerged) {
      return 'Merged';
    }
    if (isOpen) {
      return 'Open';
    }
    return 'Closed';
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.sm,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
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
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginBottom: theme.spacing.xs,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {isIssue ? '🔵' : '🟣'} {link.owner}/{link.repo}#{link.number}
          <span style={{ fontSize: theme.typography.fontSize.xs, opacity: 0.7 }}>
            ({isIssue ? t('github.issueLabel', { defaultValue: 'Issue' }) : t('github.prLabel', { defaultValue: 'PR' })}
            )
          </span>
        </a>
        {status.title && (
          <div
            style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.xs,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {status.title}
          </div>
        )}
      </div>
      <div
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: getStatusBadgeColor(),
          color: COLOR_NAMED_WHITE,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          textTransform: 'uppercase',
        }}
      >
        {getStatusText()}
      </div>
    </div>
  );
};
