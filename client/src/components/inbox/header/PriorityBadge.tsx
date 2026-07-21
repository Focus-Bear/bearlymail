import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, isEmailPriorityCalculating, isEmailPriorityUnresolved, PriorityExplanation } from 'types/email';
import { getPriorityBadge } from 'utils/priorityUtils';

import { PriorityTooltip } from 'components/priority/PriorityTooltip';
import { CATEGORY_OTHER } from 'constants/strings';
import { usePriorityCalculatedFlash } from 'hooks/usePriorityCalculatedFlash';

interface PriorityBadgeProps {
  email: Email;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: PriorityExplanation | null;
    loadingPriorityExplanation: boolean;
    priorityExplanationError: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
    expeditePriorityCalculation: (emailId: string) => Promise<void>;
    retryPriorityExplanation: (emailId: string) => Promise<void>;
  };
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  onCategoryOverride?: (newCategory: string) => void;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  email,
  priorityTooltip,
  onOverrideUrgency,
  onProvideFeedback,
  onCategoryOverride,
}) => {
  const { t } = useTranslation();
  const priorityScore = getEmailPriorityScore(email);
  const priority = getPriorityBadge(priorityScore, t);
  const isCalculating = isEmailPriorityCalculating(email);
  // Not actively calculating, but never successfully prioritised (failed/stuck).
  // Show an actionable "Not prioritised" badge instead of a perpetual spinner.
  const isUnresolved = isEmailPriorityUnresolved(email);
  // Briefly show a ✅ confirmation when the spinner resolves while the badge is mounted,
  // instead of jumping straight from "Calculating..." to the label.
  const showCalculated = usePriorityCalculatedFlash(isCalculating);

  return (
    <span
      data-priority-badge={email.id}
      style={{
        fontSize: theme.typography.fontSize.xs,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: priority.bg,
        color: priority.color,
        border: `1px solid ${priority.color}`,
        borderRadius: theme.borderRadius.full,
        fontWeight: theme.typography.fontWeight.medium,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        cursor: 'pointer',
        position: 'relative',
        zIndex: 10,
      }}
      onClick={event => {
        event.stopPropagation();
        event.preventDefault();
        if (isCalculating) {
          return;
        }
        priorityTooltip.togglePriorityTooltip(email.id);
      }}
    >
      {isCalculating ? (
        <>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              border: `2px solid ${priority.color}`,
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          🔄 {t('email.calculating')}
        </>
      ) : isUnresolved ? (
        <span title={t('email.priorityUnavailableHint')}>{t('email.priorityUnavailable')}</span>
      ) : (
        <>
          {showCalculated && (
            <span role="img" aria-label={t('email.priorityCalculated')} title={t('email.priorityCalculated')}>
              ✅
            </span>
          )}
          {`${priority.label} (${priorityScore.toFixed(0)})`}
        </>
      )}

      {priorityTooltip.hoveredPriorityEmailId === email.id && (
        <PriorityTooltip
          emailId={email.id}
          emailThreadId={email.emailThreadId}
          priorityExplanation={priorityTooltip.priorityExplanation}
          loadingPriorityExplanation={priorityTooltip.loadingPriorityExplanation}
          priorityExplanationError={priorityTooltip.priorityExplanationError}
          urgencyScore={email.urgencyScore}
          urgencyExplanation={email.urgencyExplanation}
          category={email.category || (!email.category_id ? CATEGORY_OTHER : null)}
          categoryExplanation={email.categoryExplanation}
          categorizationSource={email.categorizationSource}
          protoCategoryName={email.protoCategoryName}
          protoCategoryDescription={email.protoCategoryDescription}
          currentCategoryId={email.category_id ?? null}
          onClose={priorityTooltip.hidePriorityTooltip}
          onOverrideUrgency={onOverrideUrgency}
          onProvideFeedback={onProvideFeedback}
          onExpedite={() => priorityTooltip.expeditePriorityCalculation(email.id)}
          onRetry={() => priorityTooltip.retryPriorityExplanation(email.id)}
          onCategoryOverride={onCategoryOverride}
        />
      )}
    </span>
  );
};
