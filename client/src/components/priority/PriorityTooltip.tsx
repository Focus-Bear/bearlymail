import React from 'react';
import { PriorityTooltipLoading } from 'components/priority/tooltip/PriorityTooltipLoading';
import { PriorityTooltipContainer } from 'components/priority/tooltip/PriorityTooltipContainer';
import { PriorityTooltipContent } from 'components/priority/tooltip/PriorityTooltipContent';

interface PriorityExplanation {
  score: number;
  dimensions?: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment: { score: number; type: string; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface PriorityTooltipProps {
  emailId: string;
  emailThreadId?: string;
  priorityExplanation: PriorityExplanation | null;
  loadingPriorityExplanation: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  onClose: () => void;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
}

export const PriorityTooltip: React.FC<PriorityTooltipProps> = ({
  emailId,
  emailThreadId,
  priorityExplanation,
  loadingPriorityExplanation,
  urgencyScore,
  urgencyExplanation,
  onClose,
  onOverrideUrgency,
  onProvideFeedback,
  onExpedite,
}) => {

  // #region agent log
  // eslint-disable-next-line no-restricted-syntax -- 'undefined' is a standard JavaScript typeof result
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriorityTooltip.tsx:30',message:'PriorityTooltip render check',logData:{emailId,hasPriorityExplanation:!!priorityExplanation,loadingPriorityExplanation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }
  // #endregion
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
        onClose={onClose}
        onProvideFeedback={onProvideFeedback}
        onExpedite={onExpedite}
      />
    </PriorityTooltipContainer>
  );
};
