import React from 'react';
import { theme } from '../../theme/theme';
import { GitHubLink } from '../../types/email';
import { GitHubStatusBadge } from './GitHubStatusBadge';

interface GitHubStatusBadgesProps {
  links: GitHubLink[];
}

export const GitHubStatusBadges: React.FC<GitHubStatusBadgesProps> = ({ links }) => {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
      {links.map((link, i) => (
        <GitHubStatusBadge key={i} link={link} />
      ))}
    </div>
  );
};



