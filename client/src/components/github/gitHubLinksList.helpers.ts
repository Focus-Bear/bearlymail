/**
 * Pure helper functions extracted from GitHubLinksList.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { GitHubLink } from 'types/email';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

/** Primary key is owner/repo/number — most reliable way to identify a GitHub issue/PR */
export function getDedupeKey(link: GitHubLink): string {
  return `${link.owner}/${link.repo}#${link.number}`.toLowerCase();
}

/** Build a dedupeKey from suggested-action metadata (issueInfo or defaultRepo). */
export function getActionKey(action: SuggestedAction): string | null {
  const info = action.metadata?.issueInfo as { owner: string; repo: string; number?: number } | undefined;
  if (info?.owner && info?.repo && info?.number != null) {
    return `${info.owner}/${info.repo}#${info.number}`.toLowerCase();
  }
  if (info?.owner && info?.repo) {
    // Create-issue action targets a repo, not a specific issue
    return `${info.owner}/${info.repo}`.toLowerCase();
  }
  const defaultRepo = action.metadata?.defaultRepo as { owner: string; repo: string } | undefined;
  if (defaultRepo?.owner && defaultRepo?.repo) {
    return `${defaultRepo.owner}/${defaultRepo.repo}`.toLowerCase();
  }
  return null;
}
