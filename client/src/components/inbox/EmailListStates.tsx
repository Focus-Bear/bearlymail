import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxMode } from 'types/email';

import {
  AllCaughtUpState,
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  LoadingState,
  ProgressiveUnlockPrompt,
  SyncingState,
} from 'components/inbox/states';
import {
  HIGH_PRIORITY_THRESHOLD,
  LOW_PRIORITY_THRESHOLD,
  MEDIUM_PRIORITY_THRESHOLD,
  VERY_HIGH_PRIORITY_THRESHOLD,
} from 'hooks/useInboxFilters';

interface PriorityCounts {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
  unprioritised?: number;
}

interface TierDescriptor {
  /** The minimum priority score for emails in the "current" tier being evaluated */
  fromMin: number;
  /** Human-readable i18n key suffix for "done" message */
  doneMsgKey: string;
  /** Priority counts key that must be > 0 for this tier to be the next unlock target */
  nextCountKey: keyof PriorityCounts;
  /** i18n key for the label of the next tier */
  nextLabelKey: string;
  /** minPriority value to pass when unlocking */
  nextMin: number;
  /** maxPriority value to pass when unlocking (null = no ceiling) */
  nextMax: number | null;
}

/**
 * Ordered chain of progressive unlock tiers.
 * Each entry describes: "when the user is at tier X and emailsEmpty, look for next non-empty tier."
 * Allows skipping empty tiers (e.g. VH → Medium when High=0).
 */
const TIER_CHAIN: TierDescriptor[] = [
  {
    fromMin: VERY_HIGH_PRIORITY_THRESHOLD,
    doneMsgKey: 'inbox.progressiveUnlock.veryHighDone',
    nextCountKey: 'high',
    nextLabelKey: 'inbox.progressiveUnlock.highLabel',
    nextMin: HIGH_PRIORITY_THRESHOLD,
    nextMax: VERY_HIGH_PRIORITY_THRESHOLD,
  },
  {
    fromMin: HIGH_PRIORITY_THRESHOLD,
    doneMsgKey: 'inbox.progressiveUnlock.highDone',
    nextCountKey: 'medium',
    nextLabelKey: 'inbox.progressiveUnlock.mediumLabel',
    nextMin: MEDIUM_PRIORITY_THRESHOLD,
    nextMax: HIGH_PRIORITY_THRESHOLD,
  },
  {
    fromMin: MEDIUM_PRIORITY_THRESHOLD,
    doneMsgKey: 'inbox.progressiveUnlock.mediumDone',
    nextCountKey: 'low',
    nextLabelKey: 'inbox.progressiveUnlock.lowLabel',
    nextMin: LOW_PRIORITY_THRESHOLD,
    nextMax: MEDIUM_PRIORITY_THRESHOLD,
  },
];

/**
 * Find the first tier in the chain below the current minPriority that has emails.
 * Allows skipping tiers (e.g. VH → Medium when High=0, Medium=5).
 */
function findNextNonEmptyTier(minPriority: number, priorityCounts: PriorityCounts): TierDescriptor | null {
  // Find index of the current active tier (first tier whose fromMin <= minPriority)
  const currentTierIndex = TIER_CHAIN.findIndex(tier => minPriority >= tier.fromMin);
  if (currentTierIndex === -1) {
    return null;
  }

  // Walk down from current tier, looking for first one with emails in the NEXT bucket
  for (let i = currentTierIndex; i < TIER_CHAIN.length; i++) {
    const tier = TIER_CHAIN[i];
    const count = priorityCounts[tier.nextCountKey];
    if (typeof count === 'number' && count > 0) {
      return tier;
    }
  }
  return null;
}

/**
 * Compute the total count of emails in priority tiers below the given minPriority.
 * Used to detect whether a filtered-empty state is misleading (lower emails exist).
 */
function computeTotalLowerPriority(minPriority: number, counts: PriorityCounts): number {
  let total = 0;
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD) {
    total += counts.high;
  }
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) {
    total += counts.medium;
  }
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD) {
    total += counts.low;
  }
  if (minPriority >= LOW_PRIORITY_THRESHOLD) {
    total += counts.veryLow;
  }
  return total;
}

/**
 * Human-readable label for the current active priority filter tier.
 */
function getCurrentTierLabel(minPriority: number, translate: (key: string) => string): string {
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.veryHigh');
  }
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.high');
  }
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.medium');
  }
  return translate('inbox.priority.low');
}

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  /**
   * True when a mailbox sync is in progress. When the inbox would otherwise
   * show the generic empty state, a "Syncing your mailbox…" state is shown
   * instead so the user knows emails are still on their way.
   */
  isSyncing?: boolean;
  onRetry: () => void;
  /** Current priority filter lower bound (null = no lower bound / show all) */
  minPriority?: number | null;
  /** Current priority filter upper bound (null = no upper cap) */
  maxPriority?: number | null;
  /** Counts of threads in each priority tier — used for progressive unlock prompt */
  priorityCounts?: PriorityCounts | null;
  /** Called when user accepts the progressive unlock offer to a lower tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
  /** Called when user clicks "Show all emails" to clear the priority filter */
  onClearFilters?: () => void;
}

interface EmptyInboxProps {
  t: (key: string) => string;
  isUnlockPromptDismissed: boolean;
  minPriority: number | null | undefined;
  maxPriority: number | null | undefined;
  priorityCounts: PriorityCounts | null | undefined;
  mode: InboxMode;
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  onDismissUnlockPrompt?: () => void;
  handleDismissPrompt: () => void;
  onClearFilters?: () => void;
}

/**
 * Renders the appropriate state when the email list is empty.
 * Extracted to reduce complexity of the parent component.
 *
 * Decision tree:
 * 1. Progressive unlock prompt — filter active, not dismissed, next tier has emails → ProgressiveUnlockPrompt
 * 2. All caught up — filter active, priorityCounts loaded, ALL lower tiers empty → AllCaughtUpState
 * 3. Filtered but lower emails exist — filter active, priorityCounts loaded, lower > 0 (e.g. dismissed) → FilteredEmptyState
 * 4. Genuine empty / loading — no filter, or priorityCounts still loading → EmptyState
 */
function EmptyInboxContent({
  t,
  isUnlockPromptDismissed,
  minPriority,
  maxPriority,
  priorityCounts,
  mode,
  onUnlockPriorityTier,
  onDismissUnlockPrompt,
  handleDismissPrompt,
  onClearFilters,
}: EmptyInboxProps): React.ReactElement {
  const hasActiveFilter =
    (minPriority !== null && minPriority !== undefined) || (maxPriority !== null && maxPriority !== undefined);

  // 1. Progressive unlock prompt (only when user hasn't dismissed it for this session).
  //    Dismissal hides the prompt but does NOT disable filter-awareness (fixes edge case 1).
  //    Progressive unlock only applies to unbounded tier views (maxPriority=null/undefined).
  //    When maxPriority is set, the user is viewing a specific bounded bucket and unlock
  //    is not relevant — fall through to FilteredEmptyState or AllCaughtUpState instead.
  const isPromptEligible =
    hasActiveFilter && !isUnlockPromptDismissed && (maxPriority === null || maxPriority === undefined);

  if (isPromptEligible && priorityCounts && onUnlockPriorityTier && onDismissUnlockPrompt) {
    const nextTier = findNextNonEmptyTier(minPriority as number, priorityCounts);
    if (nextTier) {
      const nextCount = priorityCounts[nextTier.nextCountKey] as number;
      return (
        <ProgressiveUnlockPrompt
          message={t(nextTier.doneMsgKey)}
          nextTierLabel={t(nextTier.nextLabelKey)}
          nextTierCount={nextCount}
          onYes={() => onUnlockPriorityTier(nextTier.nextMin, nextTier.nextMax)}
          onLater={handleDismissPrompt}
        />
      );
    }
  }

  // 2 & 3 require priorityCounts to be loaded — guard here (fixes edge case 2).
  if (hasActiveFilter && priorityCounts) {
    // 2. True "all caught up" — every lower tier (across all bands) is genuinely empty.
    const allLowerTiersEmpty =
      priorityCounts.high === 0 &&
      priorityCounts.medium === 0 &&
      priorityCounts.low === 0 &&
      priorityCounts.veryLow === 0;

    if (allLowerTiersEmpty) {
      return <AllCaughtUpState />;
    }

    // 3. Filter active, lower-priority emails exist (dismissed or no callbacks).
    //    Show FilteredEmptyState rather than the misleading generic EmptyState.
    //    Use filter-aware count so the number reflects emails actually below the current tier.
    const totalLower = computeTotalLowerPriority(minPriority as number, priorityCounts);
    const displayCount =
      totalLower > 0
        ? totalLower
        : priorityCounts.high + priorityCounts.medium + priorityCounts.low + priorityCounts.veryLow;

    return (
      <FilteredEmptyState
        currentTierLabel={getCurrentTierLabel(minPriority as number, t)}
        lowerPriorityCount={displayCount}
        onShowAll={onClearFilters}
      />
    );
  }

  // 4. No filter active, or priorityCounts not yet loaded — fall back to generic EmptyState.
  return <EmptyState mode={mode} />;
}

/**
 * Email list states component
 * Handles loading, error, and empty states for email list.
 * When inbox is empty at the current priority tier, shows a ProgressiveUnlockPrompt
 * inviting the user to show the next lower priority tier.
 */
export const EmailListStates: React.FC<EmailListStatesProps> = ({
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  emailsEmpty,
  mode,
  isSyncing,
  onRetry,
  minPriority,
  maxPriority,
  priorityCounts,
  onUnlockPriorityTier,
  onDismissUnlockPrompt,
  onClearFilters,
}) => {
  const { t } = useTranslation();
  const [isUnlockPromptDismissed, setIsUnlockPromptDismissed] = useState(false);

  /**
   * Handles "Maybe Later" — hides the prompt for this session without
   * changing the current priority tier (does NOT unlock all emails).
   */
  const handleDismissPrompt = () => {
    setIsUnlockPromptDismissed(true);
    onDismissUnlockPrompt?.();
  };

  if (loading || !hasInitiallyLoaded || loadingModeSwitch) {
    return <LoadingState decrypting={decrypting} loadingModeSwitch={loadingModeSwitch} mode={mode} />;
  }

  if (fetchError) {
    return <ErrorState error={fetchError} onRetry={onRetry} />;
  }

  if (emailsEmpty) {
    // While a mailbox sync is running and no priority filter is narrowing the
    // view, the inbox is empty simply because emails haven't arrived yet. Show
    // the friendly "Syncing…" state instead of the misleading "all caught up"
    // empty state. A filter being active means real emails exist elsewhere, so
    // let EmptyInboxContent handle those (progressive unlock / filtered empty).
    const hasActiveFilter =
      (minPriority !== null && minPriority !== undefined) || (maxPriority !== null && maxPriority !== undefined);
    if (isSyncing && !hasActiveFilter) {
      return <SyncingState />;
    }

    return (
      <EmptyInboxContent
        t={t}
        isUnlockPromptDismissed={isUnlockPromptDismissed}
        minPriority={minPriority}
        maxPriority={maxPriority}
        priorityCounts={priorityCounts}
        mode={mode}
        onUnlockPriorityTier={onUnlockPriorityTier}
        onDismissUnlockPrompt={onDismissUnlockPrompt}
        handleDismissPrompt={handleDismissPrompt}
        onClearFilters={onClearFilters}
      />
    );
  }

  return null;
};
