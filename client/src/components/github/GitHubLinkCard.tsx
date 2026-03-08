import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { GitHubAssignees } from 'components/github/GitHubAssignees';
import { GitHubLabels } from 'components/github/GitHubLabels';
import { GitHubLinkCardNoStatus } from 'components/github/GitHubLinkCardNoStatus';
import { GitHubLinkHeader } from 'components/github/GitHubLinkHeader';
import { GitHubProject } from 'components/github/GitHubProject';
import { GitHubPRStatusBadges } from 'components/github/GitHubPRStatusBadges';
import { GITHUB_STATE_OPEN, GITHUB_STATUS_MERGED, LINK_TYPE_ISSUE } from 'constants/strings';

interface GitHubLinkCardProps {
  link: GitHubLink;
}

export const GitHubLinkCard: React.FC<GitHubLinkCardProps> = ({ link }) => {
  const status = link.status;

  if (!status) {
    return <GitHubLinkCardNoStatus link={link} />;
  }

  const isIssue = link.type === LINK_TYPE_ISSUE;
  const isOpen = status.state === GITHUB_STATE_OPEN;
  const isMerged = status.merged || status.state === GITHUB_STATUS_MERGED;

  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <GitHubLinkHeader link={link} status={status} isIssue={isIssue} isOpen={isOpen} isMerged={isMerged} />
      {!isIssue && (
        <GitHubPRStatusBadges
          reviewStatus={status.reviewStatus}
          commentsCount={status.commentsCount}
          mergeable={status.mergeable}
        />
      )}
      <GitHubLabels labels={status.labels || []} />
      <GitHubAssignees assignees={status.assignees || []} />
      <GitHubProject projects={status.projects} />
    </div>
  );
};
