import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { GitHubStatusEmptyState } from 'components/github/GitHubStatusEmptyState';
import { GitHubStatusHeader } from 'components/github/GitHubStatusHeader';
import { GitHubStatusLoading } from 'components/github/GitHubStatusLoading';
import { GitHubLinksList } from 'components/github/GitHubLinksList';

interface GitHubStatusSectionProps {
  links: GitHubLink[];
  loading: boolean;
  hasToken: boolean;
  onRefresh: () => void;
}

export const GitHubStatusSection: React.FC<GitHubStatusSectionProps> = ({
  links,
  loading,
  hasToken,
  onRefresh,
}) => {
  if (!hasToken) {
    return null;
  }

  if (!loading && links.length === 0) {
    return <GitHubStatusEmptyState loading={loading} onRefresh={onRefresh} />;
  }

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      boxShadow: theme.shadows.sm,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <GitHubStatusHeader loading={loading} onRefresh={onRefresh} />
      {loading ? (
        <GitHubStatusLoading />
      ) : (
        <GitHubLinksList links={links} />
      )}
    </div>
  );
};



