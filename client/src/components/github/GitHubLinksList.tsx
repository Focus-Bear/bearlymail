import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { GitHubLinkCard } from 'components/github/GitHubLinkCard';

interface GitHubLinksListProps {
  links: GitHubLink[];
}

// Primary key is owner/repo/number - this is the most reliable way to identify a GitHub issue/PR
const getDedupeKey = (link: GitHubLink): string => {
  return `${link.owner}/${link.repo}#${link.number}`.toLowerCase();
};

export const GitHubLinksList: React.FC<GitHubLinksListProps> = ({ links }) => {
  // Deduplicate links by owner/repo/number - keep the one with more data
  const uniqueLinks = React.useMemo(() => {
    const linkMap = new Map<string, GitHubLink>();
    for (const link of links) {
      const key = getDedupeKey(link);
      const existing = linkMap.get(key);
      if (!existing) {
        linkMap.set(key, link);
      } else {
        // Keep the one with more status info (e.g., has reviewDecision or comments)
        const existingHasReview = !!existing.status?.reviewDecision;
        const newHasReview = !!link.status?.reviewDecision;
        if (newHasReview && !existingHasReview) {
          linkMap.set(key, link);
        }
      }
    }
    return Array.from(linkMap.values());
  }, [links]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {uniqueLinks.map((link) => (
        <GitHubLinkCard key={getDedupeKey(link)} link={link} />
      ))}
    </div>
  );
};






