import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PriorityTooltipActions } from 'components/priority/tooltip/PriorityTooltipActions';
import { PriorityTooltipBreakdown } from 'components/priority/tooltip/PriorityTooltipBreakdown';
import { PriorityTooltipCategory } from 'components/priority/tooltip/PriorityTooltipCategory';
import { PriorityTooltipHeader } from 'components/priority/tooltip/PriorityTooltipHeader';

interface PriorityExplanation {
  score: number;
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface PriorityTooltipContentProps {
  loadingPriorityExplanation: boolean;
  priorityExplanation: PriorityExplanation | null;
  category?: string | null;
  categoryExplanation?: string | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  emailId: string;
  /** UUID of the email's current category — passed through to CategoryOverrideModal. */
  currentCategoryId?: string | null;
  onClose: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
  onCategoryOverride?: (newCategory: string) => void;
}

export const PriorityTooltipContent: React.FC<PriorityTooltipContentProps> = ({
  loadingPriorityExplanation,
  priorityExplanation,
  category,
  categoryExplanation,
  protoCategoryName,
  protoCategoryDescription,
  emailId,
  currentCategoryId,
  onClose,
  onProvideFeedback,
  onExpedite,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();

  if (loadingPriorityExplanation) {
    return <div style={{ textAlign: 'center', padding: theme.spacing.md }}>{t('common.loading')}</div>;
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
        {category && (
          <PriorityTooltipCategory
            category={category}
            categoryExplanation={categoryExplanation}
            protoCategoryName={protoCategoryName}
            protoCategoryDescription={protoCategoryDescription}
            emailId={emailId}
            currentCategoryId={currentCategoryId}
            onCategoryOverride={onCategoryOverride}
          />
        )}
        <PriorityTooltipBreakdown breakdown={priorityExplanation.breakdown || []} onExpedite={onExpedite} />
        <PriorityTooltipActions emailId={emailId} onProvideFeedback={onProvideFeedback} />
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', color: theme.colors.text.secondary }}>
      {t('priority.tooltip.hoverToSeeDetails')}
    </div>
  );
};
