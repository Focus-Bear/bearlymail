import React, { useCallback, useEffect, useMemo } from 'react';
import { captureEvent } from 'utils/posthog';

import { usePendingAutoArchiveProposals } from 'components/settings/auto-archive/usePendingAutoArchiveProposals';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { AutoArchiveSuggestionsBanner } from './AutoArchiveSuggestionsBanner';
import { useAutoArchiveNoticeDismissal } from './useAutoArchiveNoticeDismissal';

interface AutoArchiveSuggestionsNoticeProps {
  /** Current user id — dismissal is persisted per user in localStorage. */
  userId?: string;
  /** Held back until the tour is done so it never stacks on a new user's first inbox. */
  hasSeenTour?: boolean;
}

const NO_PROPOSAL_IDS: string[] = [];

/**
 * Inbox nudge for auto-archive suggestions. They're mined daily but only listed
 * under Settings > Workflows, so without this the user rarely finds them. The
 * fetch never blocks the inbox and a failure just leaves the notice hidden.
 * Reviewing counts as seeing the current set, same as dismissing.
 */
export const AutoArchiveSuggestionsNotice: React.FC<AutoArchiveSuggestionsNoticeProps> = ({ userId, hasSeenTour }) => {
  const isEligible = Boolean(userId) && hasSeenTour === true;
  const { data: pendingProposals } = usePendingAutoArchiveProposals(isEligible);
  const proposalIds = useMemo(
    () => pendingProposals?.map(proposal => proposal.id) ?? NO_PROPOSAL_IDS,
    [pendingProposals]
  );
  const { hasUndismissedProposal, dismiss } = useAutoArchiveNoticeDismissal(userId, proposalIds);
  const pendingCount = proposalIds.length;
  const isVisible = isEligible && pendingCount > 0 && hasUndismissedProposal;

  useEffect(() => {
    if (isVisible) {
      captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_SHOWN, { count: pendingCount });
    }
  }, [isVisible, pendingCount]);

  const handleReview = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_REVIEW_CLICKED, { count: pendingCount });
    dismiss();
  }, [dismiss, pendingCount]);

  const handleDismiss = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_DISMISSED, { count: pendingCount });
    dismiss();
  }, [dismiss, pendingCount]);

  if (!isVisible) {
    return null;
  }

  return <AutoArchiveSuggestionsBanner pendingCount={pendingCount} onReview={handleReview} onDismiss={handleDismiss} />;
};
