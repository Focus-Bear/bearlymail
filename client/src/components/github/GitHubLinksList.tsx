import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { GitHubLinkCard } from 'components/github/GitHubLinkCard';

interface GitHubLinksListProps {
  links: GitHubLink[];
}

export const GitHubLinksList: React.FC<GitHubLinksListProps> = ({ links }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {links.map((link) => (
        <GitHubLinkCard key={link.url || `${link.owner}-${link.repo}-${link.number}`} link={link} />
      ))}
    </div>
  );
};






