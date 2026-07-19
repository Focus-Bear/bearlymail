import { useCallback } from 'react';
import { Email, getEmailPriorityScore } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  DEFAULT_PRIORITY_SCORE,
  PERCENTAGE_12_5,
  PERCENTAGE_37_5,
  PERCENTAGE_62_5,
  PERCENTAGE_87_5,
  STAR_COUNT_THRESHOLD_20,
} from 'constants/numbers';

interface UseStarCountHandlerProps {
  emails: Email[];
  handleSetStarCountBase: (
    emailId: string,
    starCount: number,
    event?: React.MouseEvent
  ) => Promise<{ discrepancy: number; predictedStarCount: number } | null>;
  onShowStarDiscrepancy: (
    emailId: string,
    userStarCount: number,
    predictedStarCount: number,
    emailSubject?: string
  ) => void;
  onShowPriorityOverride: (
    emailId: string,
    originalPriorityScore: number,
    newPriorityScore: number,
    context?: 'archive' | 'star' | 'manual',
    emailSubject?: string
  ) => void;
}

export function useStarCountHandler({
  emails,
  handleSetStarCountBase,
  onShowStarDiscrepancy,
  onShowPriorityOverride,
}: UseStarCountHandlerProps) {
  const handleSetStarCount = useCallback(
    async (emailId: string, starCount: number, event?: React.MouseEvent) => {
      const email = emails.find(event => event.id === emailId);
      const previousStarCount = email?.starCount || 0;
      const originalPriorityScore = email ? getEmailPriorityScore(email) : DEFAULT_PRIORITY_SCORE;

      captureEvent(ANALYTICS_EVENTS.EMAIL_STAR_SET, {
        email_id: emailId,
        star_count: starCount,
        previous_star_count: previousStarCount,
      });

      const result = await handleSetStarCountBase(emailId, starCount, event);

      // Convert star count to priority score (0 stars = 0-25, 1 star = 26-50, 2 stars = 51-75, 3 stars = 76-100)
      const newPriorityScore = (() => {
        if (starCount === 0) {
          return PERCENTAGE_12_5;
        }
        if (starCount === 1) {
          return PERCENTAGE_37_5;
        }
        if (starCount === 2) {
          return PERCENTAGE_62_5;
        }
        return PERCENTAGE_87_5;
      })();

      if (result && result.discrepancy >= 2 && starCount > 0) {
        // Show priority override modal for significant discrepancies
        const priorityDifference = Math.abs(newPriorityScore - originalPriorityScore);
        const emailSubject = email?.subject ?? undefined;
        if (priorityDifference >= STAR_COUNT_THRESHOLD_20) {
          onShowPriorityOverride(emailId, originalPriorityScore, newPriorityScore, 'star', emailSubject);
        } else {
          // Fall back to star discrepancy modal for smaller differences
          onShowStarDiscrepancy(emailId, starCount, result.predictedStarCount, emailSubject);
        }
      }
    },
    [emails, handleSetStarCountBase, onShowStarDiscrepancy, onShowPriorityOverride]
  );

  return { handleSetStarCount };
}
