import React from 'react';
import { PriorityExplanation } from 'types/email';

import { PriorityTooltipContainer } from 'components/priority/tooltip/PriorityTooltipContainer';
import { PriorityTooltipContent } from 'components/priority/tooltip/PriorityTooltipContent';
import { PriorityTooltipLoading } from 'components/priority/tooltip/PriorityTooltipLoading';

interface PriorityTooltipProps {
  emailId: string;
  emailThreadId?: string;
  priorityExplanation: PriorityExplanation | null;
  loadingPriorityExplanation: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  category?: string | null;
  categoryExplanation?: string | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  /** UUID of the email's current category — threaded through to CategoryOverrideModal. */
  currentCategoryId?: string | null;
  onClose: () => void;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
  onCategoryOverride?: (newCategory: string) => void;
}

export const PriorityTooltip: React.FC<PriorityTooltipProps> = ({
  emailId,
  emailThreadId,
  priorityExplanation,
  loadingPriorityExplanation,
  urgencyScore,
  urgencyExplanation,
  category,
  categoryExplanation,
  protoCategoryName,
  protoCategoryDescription,
  currentCategoryId,
  onClose,
  onOverrideUrgency,
  onProvideFeedback,
  onExpedite,
  onCategoryOverride,
}) => {
  // Always show the tooltip if it's the hovered email, even if loading or no explanation yet
  // This prevents the blank popup from auto-closing
  if (!priorityExplanation && !loadingPriorityExplanation) {
    return <PriorityTooltipLoading emailId={emailId} />;
  }

  return (
    <PriorityTooltipContainer emailId={emailId}>
      <PriorityTooltipContent
        loadingPriorityExplanation={loadingPriorityExplanation}
        priorityExplanation={priorityExplanation}
        category={category}
        categoryExplanation={categoryExplanation}
        protoCategoryName={protoCategoryName}
        protoCategoryDescription={protoCategoryDescription}
        emailId={emailId}
        currentCategoryId={currentCategoryId}
        onClose={onClose}
        onProvideFeedback={onProvideFeedback}
        onExpedite={onExpedite}
        onCategoryOverride={onCategoryOverride}
      />
    </PriorityTooltipContainer>
  );
};
