import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { GitHubStatusHeader } from 'components/github/GitHubStatusHeader';
import { GitHubStatusLoading } from 'components/github/GitHubStatusLoading';
import { GitHubLinksList } from 'components/github/GitHubLinksList';
import { emailMentionsGitHub } from 'utils/githubUtils';

interface GitHubStatusSectionProps {
  links: GitHubLink[];
  loading: boolean;
  hasToken: boolean;
  onRefresh: () => void;
  emailSubject?: string;
  emailBody?: string;
  emailHtmlBody?: string;
}

export const GitHubStatusSection: React.FC<GitHubStatusSectionProps> = ({
  links,
  loading,
  hasToken,
  onRefresh,
  emailSubject,
  emailBody,
  emailHtmlBody,
}) => {
  if (!hasToken) {
    return null;
  }

  // Instant keyword check - if email doesn't mention GitHub, don't show section at all
  if (!emailMentionsGitHub(emailSubject, emailBody, emailHtmlBody)) {
    return null;
  }

  // Hide section completely if no links and not loading
  // Only show if we have links or are actively loading (for legacy emails without cached metadata)
  if (!loading && links.length === 0) {
    return null;
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



