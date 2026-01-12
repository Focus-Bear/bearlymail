import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { PriorityTooltipHeader } from 'components/priority/tooltip/PriorityTooltipHeader';
import { PriorityTooltipBreakdown } from 'components/priority/tooltip/PriorityTooltipBreakdown';
import { PriorityTooltipActions } from 'components/priority/tooltip/PriorityTooltipActions';

interface PriorityExplanation {
  score: number;
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface PriorityTooltipContentProps {
  loadingPriorityExplanation: boolean;
  priorityExplanation: PriorityExplanation | null;
  onClose: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
}

export const PriorityTooltipContent: React.FC<PriorityTooltipContentProps> = ({
  loadingPriorityExplanation,
  priorityExplanation,
  onClose,
  onProvideFeedback,
  onExpedite,
}) => {
  const { t } = useTranslation();
  
  if (loadingPriorityExplanation) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
        {t('common.loading')}
      </div>
    );
  }

  if (priorityExplanation) {
    return (
      <div>
        <PriorityTooltipHeader 
          score={priorityExplanation.score} 
          breakdown={priorityExplanation.breakdown}
          onClose={onClose}
          onExpedite={onExpedite}
        />
        <PriorityTooltipBreakdown breakdown={priorityExplanation.breakdown || []} onExpedite={onExpedite} />
        <PriorityTooltipActions onProvideFeedback={onProvideFeedback} />
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', color: theme.colors.text.secondary }}>
      {t('priority.tooltip.hoverToSeeDetails')}
    </div>
  );
};



