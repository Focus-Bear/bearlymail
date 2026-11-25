import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { AiDecisionProvider, CategorizationSource, PriorityExplanation, PriorityScoreSource } from 'types/email';

import type { PhishingVerdictEmail } from 'components/priority/tooltip/phishingVerdict.helpers';
import { PriorityTooltipContainer } from 'components/priority/tooltip/PriorityTooltipContainer';
import { PriorityTooltipContent } from 'components/priority/tooltip/PriorityTooltipContent';
import { PriorityTooltipLoading } from 'components/priority/tooltip/PriorityTooltipLoading';
import { PriorityTooltipPhishing } from 'components/priority/tooltip/PriorityTooltipPhishing';

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
  /** AI engine behind an 'ai' categorizationSource (e.g. "LLM (Gemini)"). */
  categorizationProvider?: AiDecisionProvider | null;
  /** How the score was set, and the AI engine when an LLM/Jev scored it. */
  prioritySource?: PriorityScoreSource | null;
  priorityProvider?: AiDecisionProvider | null;
  protoCategoryName?: string | null;
  protoCategoryDescription?: string | null;
  /** UUID of the email's current category — threaded through to CategoryOverrideModal. */
  currentCategoryId?: string | null;
  /** The email's stored phishing decision, shown above the priority breakdown. */
  phishing?: PhishingVerdictEmail;
  onClose: () => void;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  onExpedite?: () => void;
  onRetry?: () => void;
  onCategoryOverride?: (newCategory: string) => void;
}

interface TooltipMessageProps {
  message: string;
  onRetry?: () => void;
}

/** A centred status line for the states without a breakdown, with an optional Retry. */
const TooltipMessage: React.FC<TooltipMessageProps> = ({ message, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
      <div style={{ color: theme.colors.text.secondary }}>{message}</div>
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
  );
};

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
  categorizationProvider,
  prioritySource,
  priorityProvider,
  protoCategoryName,
  protoCategoryDescription,
  currentCategoryId,
  phishing,
  onClose,
  onOverrideUrgency,
  onProvideFeedback,
  onExpedite,
  onRetry,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();
  const phishingSection = phishing ? <PriorityTooltipPhishing email={phishing} /> : null;

  if (priorityExplanationError && !loadingPriorityExplanation) {
    return (
      <PriorityTooltipContainer emailId={emailId} onClose={onClose}>
        {phishingSection}
        <TooltipMessage message={t('priority.tooltip.loadError')} onRetry={onRetry} />
      </PriorityTooltipContainer>
    );
  }

  if (!priorityExplanation && loadingPriorityExplanation) {
    if (!phishingSection) {
      return <PriorityTooltipLoading emailId={emailId} />;
    }
    return (
      <PriorityTooltipContainer emailId={emailId} onClose={onClose}>
        {phishingSection}
        <TooltipMessage message={t('priority.tooltip.loading')} />
      </PriorityTooltipContainer>
    );
  }

  if (!priorityExplanation) {
    return (
      <PriorityTooltipContainer emailId={emailId} onClose={onClose}>
        {phishingSection}
        <TooltipMessage message={t('priority.tooltip.noData')} onRetry={onRetry} />
      </PriorityTooltipContainer>
    );
  }

  return (
    <PriorityTooltipContainer emailId={emailId} onClose={onClose}>
      <PriorityTooltipContent
        loadingPriorityExplanation={loadingPriorityExplanation}
        priorityExplanation={priorityExplanation}
        category={category}
        categoryExplanation={categoryExplanation}
        categorizationSource={categorizationSource}
        categorizationProvider={categorizationProvider}
        prioritySource={prioritySource}
        priorityProvider={priorityProvider}
        protoCategoryName={protoCategoryName}
        protoCategoryDescription={protoCategoryDescription}
        emailId={emailId}
        currentCategoryId={currentCategoryId}
        phishingSection={phishingSection}
        onClose={onClose}
        onProvideFeedback={onProvideFeedback}
        onExpedite={onExpedite}
        onCategoryOverride={onCategoryOverride}
      />
    </PriorityTooltipContainer>
  );
};
