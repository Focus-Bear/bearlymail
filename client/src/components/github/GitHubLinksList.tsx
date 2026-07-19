import React from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { GitHubLinkCard } from 'components/github/GitHubLinkCard';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

import { getActionKey, getDedupeKey } from './gitHubLinksList.helpers';

interface GitHubLinksListProps {
  links: GitHubLink[];
  /** GitHub-related suggested actions to distribute to matching link cards. */
  suggestedActions?: SuggestedAction[];
  /** Called after a suggested action succeeds so the parent can refresh GitHub data. */
  onRefresh?: () => void;
  /** Email context forwarded to modals inside each card. */
  email?: { subject?: string; body?: string; from?: string; fromName?: string } | null;
}

export const GitHubLinksList: React.FC<GitHubLinksListProps> = ({ links, suggestedActions = [], onRefresh, email }) => {
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
        const existingHasReview = !!existing.status?.reviewStatus;
        const newHasReview = !!link.status?.reviewStatus;
        if (newHasReview && !existingHasReview) {
          linkMap.set(key, link);
        }
      }
    }
    return Array.from(linkMap.values());
  }, [links]);

  // Build a map from link dedupeKey (or repo key) → actions
  const actionsPerLink = React.useMemo(() => {
    const map = new Map<string, SuggestedAction[]>();
    for (const action of suggestedActions) {
      const key = getActionKey(action);
      if (!key) {
        continue;
      }
      // Try exact issue match first, then repo-level fallback
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(action);
    }
    return map;
  }, [suggestedActions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {uniqueLinks.map(link => {
        const key = getDedupeKey(link);
        const repoKey = `${link.owner}/${link.repo}`.toLowerCase();
        // Actions matching this exact issue take priority; fall back to repo-level actions
        const cardActions = actionsPerLink.get(key) ?? actionsPerLink.get(repoKey) ?? [];
        return (
          <GitHubLinkCard key={key} link={link} suggestedActions={cardActions} onRefresh={onRefresh} email={email} />
        );
      })}
    </div>
  );
};
