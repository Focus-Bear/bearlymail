import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { GitHubStatusBadge } from 'components/github/GitHubStatusBadge';

interface GitHubStatusBadgesProps {
  links: GitHubLink[];
}

export const GitHubStatusBadges: React.FC<GitHubStatusBadgesProps> = ({ links }) => {
  if (!links || links.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const uniqueLinks = links.filter(link => {
    const key = link.url || `${link.owner}/${link.repo}#${link.number}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (uniqueLinks.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
      {uniqueLinks.map(link => (
        <GitHubStatusBadge key={link.url || `${link.owner}-${link.repo}-${link.number}`} link={link} />
      ))}
    </div>
  );
};
