import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface FilteredEmptyStateProps {
  /** Human-readable label for the current priority tier, e.g. "Very High priority" */
  currentTierLabel: string;
  /** Total count of emails in lower priority tiers */
  lowerPriorityCount: number;
  /**
   * True when the user had pre-existing Action/Follow-Up work at Triage session
   * start. When true, the healthy default ("Take action") is the prominent primary
   * and revealing lower-priority emails is a de-emphasised, friction-gated link.
   */
  hasExistingWork?: boolean;
  /** Primary CTA when work is waiting: go deal with the Action/Follow-Up work. */
  onTakeAction?: () => void;
  /**
   * Reveal the lower-priority emails. With existing work this is the de-emphasised
   * link and routes through the friction gate; with none it is the plain primary
   * "Show all emails" button (direct reveal).
   */
  onShowAll?: () => void;
}

/**
 * Shown when the inbox is empty at the current priority tier but lower-priority
 * emails exist. Distinguishes a filtered empty state from a genuine inbox zero.
 *
 * Emphasis mirrors the sibling ProgressiveUnlockPrompt: when the user still has
 * pre-existing Action/Follow-Up work, "Take action" is the prominent primary and
 * peeking at lower-priority emails is a de-emphasised, friction-gated link. With no
 * work to point at, a single plain "Show all emails" button reveals directly.
 *
 * Covers edge cases from issue #1434:
 * - User dismissed the ProgressiveUnlockPrompt ("Maybe Later")
 * - priorityCounts loaded but all lower tiers have emails the filter hides
 */
export const FilteredEmptyState: React.FC<FilteredEmptyStateProps> = ({
  currentTierLabel,
  lowerPriorityCount,
  hasExistingWork = false,
  onTakeAction,
  onShowAll,
}) => {
  const { t } = useTranslation();

  // Healthy path: work is waiting → prominent "Take action", de-emphasised distract link.
  const showTakeActionPrimary = hasExistingWork && !!onTakeAction;

  return (
    <div
      style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px dashed ${theme.colors.border.medium}`,
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>📭</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('inbox.filteredEmpty.noTierEmails', { tier: currentTierLabel })}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: onTakeAction || onShowAll ? theme.spacing.lg : undefined,
        }}
      >
        {t('inbox.filteredEmpty.hasLowerPriority', { count: lowerPriorityCount })}
      </p>

      {showTakeActionPrimary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, alignItems: 'center' }}>
          <button
            onClick={onTakeAction}
            data-testid="filtered-take-action"
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              backgroundColor: theme.colors.accent.success,
              color: theme.colors.common.white,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.base,
            }}
          >
            {t('inbox.guidedPeek.takeActionCta')}
          </button>
          {onShowAll && (
            <button
              onClick={onShowAll}
              data-testid="filtered-distract-link"
              style={{
                padding: theme.spacing.xs,
                background: 'none',
                border: 'none',
                color: theme.colors.text.secondary,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                textDecoration: 'underline',
                maxWidth: 420,
              }}
            >
              {t('inbox.filteredEmpty.distractInstead')}
            </button>
          )}
        </div>
      ) : (
        onShowAll && (
          <button
            onClick={onShowAll}
            data-testid="filtered-show-all"
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.accent.success,
              color: theme.colors.common.white,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('inbox.filteredEmpty.showAll')}
          </button>
        )
      )}
    </div>
  );
};
