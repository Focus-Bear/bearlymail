import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface FilteredEmptyStateProps {
  /** Human-readable label for the current priority tier, e.g. "Very High priority" */
  currentTierLabel: string;
  /** Total count of emails in lower priority tiers */
  lowerPriorityCount: number;
  /** Called when user clicks "Show all emails" to clear the priority filter */
  onShowAll?: () => void;
}

/**
 * Shown when the inbox is empty at the current priority tier but lower-priority
 * emails exist. Distinguishes a filtered empty state from a genuine inbox zero.
 *
 * Covers edge cases from issue #1434:
 * - User dismissed the ProgressiveUnlockPrompt ("Maybe Later")
 * - priorityCounts loaded but all lower tiers have emails the filter hides
 */
export const FilteredEmptyState: React.FC<FilteredEmptyStateProps> = ({
  currentTierLabel,
  lowerPriorityCount,
  onShowAll,
}) => {
  const { t } = useTranslation();

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
      <p style={{ color: theme.colors.text.secondary, marginBottom: onShowAll ? theme.spacing.lg : undefined }}>
        {t('inbox.filteredEmpty.hasLowerPriority', { count: lowerPriorityCount })}
      </p>
      {onShowAll && (
        <button
          onClick={onShowAll}
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
      )}
    </div>
  );
};
