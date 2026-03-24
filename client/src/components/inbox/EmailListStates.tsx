import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxMode } from 'types/email';

import { AllCaughtUpState, EmptyState, ErrorState, LoadingState, ProgressiveUnlockPrompt } from 'components/inbox/states';
import { HIGH_PRIORITY_THRESHOLD, LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

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
function findNextNonEmptyTier(
  minPriority: number,
  priorityCounts: PriorityCounts,
): TierDescriptor | null {
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

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  onRetry: () => void;
  /** Current priority filter (null = no filter / show all) */
  minPriority?: number | null;
  /** Counts of threads in each priority tier — used for progressive unlock prompt */
  priorityCounts?: PriorityCounts | null;
  /** Called when user accepts the progressive unlock offer to a lower tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
}

interface EmptyInboxProps {
  t: (key: string) => string;
  isUnlockPromptDismissed: boolean;
  minPriority: number | null | undefined;
  priorityCounts: PriorityCounts | null | undefined;
  mode: InboxMode;
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  onDismissUnlockPrompt?: () => void;
  handleDismissPrompt: () => void;
}

/**
 * Renders the appropriate state when the email list is empty.
 * Extracted to reduce complexity of the parent component.
 */
function EmptyInboxContent({
  t,
  isUnlockPromptDismissed,
  minPriority,
  priorityCounts,
  mode,
  onUnlockPriorityTier,
  onDismissUnlockPrompt,
  handleDismissPrompt,
}: EmptyInboxProps): React.ReactElement {
  // Progressive unlock: offer to drop to the next lower priority tier.
  // Uses tier-chain logic to skip empty tiers (fixes #1434).
  const hasActiveFilter = !isUnlockPromptDismissed && minPriority !== null && minPriority !== undefined;

  if (hasActiveFilter && priorityCounts && onUnlockPriorityTier && onDismissUnlockPrompt) {
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

  // "All caught up" state: no lower tiers have emails AND user is below VH filter.
  const allLowerTiersEmpty =
    priorityCounts &&
    priorityCounts.high === 0 &&
    priorityCounts.medium === 0 &&
    priorityCounts.low === 0 &&
    priorityCounts.veryLow === 0;

  if (hasActiveFilter && allLowerTiersEmpty) {
    return <AllCaughtUpState />;
  }

  // Filtered empty: filter is active but no emails match — show generic empty state.
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
  onRetry,
  minPriority,
  priorityCounts,
  onUnlockPriorityTier,
  onDismissUnlockPrompt,
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
    return (
      <EmptyInboxContent
        t={t}
        isUnlockPromptDismissed={isUnlockPromptDismissed}
        minPriority={minPriority}
        priorityCounts={priorityCounts}
        mode={mode}
        onUnlockPriorityTier={onUnlockPriorityTier}
        onDismissUnlockPrompt={onDismissUnlockPrompt}
        handleDismissPrompt={handleDismissPrompt}
      />
    );
  }

  return null;
};
