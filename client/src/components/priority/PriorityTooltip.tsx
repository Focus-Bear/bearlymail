import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { CategorizationSource, PriorityExplanation } from 'types/email';

import { PriorityTooltipContainer } from 'components/priority/tooltip/PriorityTooltipContainer';
import { PriorityTooltipContent } from 'components/priority/tooltip/PriorityTooltipContent';
import { PriorityTooltipLoading } from 'components/priority/tooltip/PriorityTooltipLoading';

interface PriorityTooltipProps {
  emailId: string;
  emailThreadId?: string;
  priorityExplanation: PriorityExplanation | null;
  loadingPriorityExplanation: boolean;
  priorityExplanationError?: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  category?: string | null;
  categoryExplanation?: string | null;
  /** Which process assigned the category — rendered as a "Categorised by" line. */
  categorizationSource?: CategorizationSource | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  /** UUID of the email's current category — threaded through to CategoryOverrideModal. */
  currentCategoryId?: string | null;
  onClose: () => void;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
  onRetry?: () => void;
  onCategoryOverride?: (newCategory: string) => void;
}

export const PriorityTooltip: React.FC<PriorityTooltipProps> = ({
  emailId,
  emailThreadId,
  priorityExplanation,
  loadingPriorityExplanation,
  priorityExplanationError = false,
  urgencyScore,
  urgencyExplanation,
  category,
  categoryExplanation,
  categorizationSource,
  protoCategoryName,
  protoCategoryDescription,
  currentCategoryId,
  onClose,
  onOverrideUrgency,
  onProvideFeedback,
  onExpedite,
  onRetry,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();

  if (priorityExplanationError && !loadingPriorityExplanation) {
    return (
      <PriorityTooltipContainer emailId={emailId}>
        <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
          <div style={{ marginBottom: theme.spacing.sm, color: theme.colors.text.secondary }}>
            {t('priority.tooltip.loadError')}
          </div>
          {onRetry && (
            <button
              onClick={event => {
                event.stopPropagation();
                event.preventDefault();
                onRetry();
              }}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                cursor: 'pointer',
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.light}`,
                background: 'none',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('priority.tooltip.retry')}
            </button>
          )}
        </div>
      </PriorityTooltipContainer>
    );
  }

  if (!priorityExplanation && loadingPriorityExplanation) {
    return <PriorityTooltipLoading emailId={emailId} />;
  }

  if (!priorityExplanation) {
    return (
      <PriorityTooltipContainer emailId={emailId}>
        <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
          <div style={{ color: theme.colors.text.secondary }}>{t('priority.tooltip.noData')}</div>
          {onRetry && (
            <button
              onClick={event => {
                event.stopPropagation();
                event.preventDefault();
                onRetry();
              }}
              style={{
                marginTop: theme.spacing.sm,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                cursor: 'pointer',
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.light}`,
                background: 'none',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('priority.tooltip.retry')}
            </button>
          )}
        </div>
      </PriorityTooltipContainer>
    );
  }

  return (
    <PriorityTooltipContainer emailId={emailId}>
      <PriorityTooltipContent
        loadingPriorityExplanation={loadingPriorityExplanation}
        priorityExplanation={priorityExplanation}
        category={category}
        categoryExplanation={categoryExplanation}
        categorizationSource={categorizationSource}
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
